import numpy as np
np.float_ = np.float64  # Fix for NumPy 2.0 compatibility

import os
import uuid
import time
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from flask_cors import CORS
import fitz  # PyMuPDF
from google import genai
import chromadb
from chromadb.config import Settings, DEFAULT_TENANT, DEFAULT_DATABASE
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps

# Load environment variables from .env file
load_dotenv()

# ----- Configuration -----
app = Flask(__name__, static_folder='static')
app.secret_key = os.environ.get('SECRET_KEY', 'a_very_secret_key_for_development') # Set a secret key for sessions
CORS(app)

# Simple in-memory user storage (Replace with a database in production)
users = {}

# Load Gemini API key from env
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise EnvironmentError("Please set the GEMINI_API_KEY environment variable.")

# Initialize Gemini client
genai_client = genai.Client(api_key=GEMINI_API_KEY)
EMBED_MODEL = "gemini-embedding-exp-03-07"
GEN_MODEL = "gemini-2.0-flash"
try:
    result = genai_client.models.generate_content(
        model="gemini-2.0-flash",
        contents="Hello, Gemini!"
    )
    print(result.text)
except Exception as e:
    print(e)

# Initialize ChromaDB persistent client
client_db = chromadb.PersistentClient(
    path="chroma_db",
    settings=Settings(),
    tenant=DEFAULT_TENANT,
    database=DEFAULT_DATABASE
)

# Delete existing collection if it exists
try:
    client_db.delete_collection("documents")
except Exception as e:
    print(f"No existing collection to delete: {e}")

# Create new collection with the correct dimensionality
collection = client_db.create_collection(
    name="documents",
    metadata={"hnsw:space": "cosine"},
    embedding_function=None  # We'll provide embeddings directly
)

# Test embedding to get dimension
try:
    test_embedding = genai_client.models.embed_content(
        model=EMBED_MODEL,
        contents="test"
    )
    embedding_dimension = len(test_embedding.embeddings[0].values)
    print(f"Using embedding dimension: {embedding_dimension}")
except Exception as e:
    print(f"Error getting embedding dimension: {e}")
    raise

# Decorator to protect routes
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

# ----- Routes -----

@app.route('/')
def home():
    if 'logged_in' not in session:
        return redirect(url_for('login'))
    return render_template('index.html')

def generate_with_retry(model, contents, max_retries=3, initial_delay=2):
    """Generate content with retry logic for rate limits"""
    for attempt in range(max_retries):
        try:
            response = genai_client.models.generate_content(
                model=model,
                contents=contents
            )
            return response.text
        except Exception as e:
            if "429" in str(e) and attempt < max_retries - 1:
                delay = initial_delay * (2 ** attempt)  # Exponential backoff
                print(f"Rate limit hit, retrying in {delay} seconds...")
                time.sleep(delay)
                continue
            raise e
    return None

def embed_with_retry(model, contents, max_retries=5, initial_delay=5):
    """Embed content with retry logic for rate limits"""
    for attempt in range(max_retries):
        try:
            response = genai_client.models.embed_content(
                model=model,
                contents=contents
            )
            return response.embeddings[0].values
        except Exception as e:
            if "429" in str(e) and attempt < max_retries - 1:
                delay = initial_delay * (2 ** attempt)  # Exponential backoff
                print(f"Rate limit hit, retrying in {delay} seconds... (Attempt {attempt + 1}/{max_retries})")
                time.sleep(delay)
                continue
            raise e
    return None

@app.route('/upload', methods=['POST'])
@login_required
def upload():
    file = request.files.get('file')
    if not file:
        return jsonify({"error": "No file uploaded"}), 400
    text = ""
    filename = file.filename

    # Extract text
    if filename.lower().endswith('.pdf'):
        pdf = fitz.open(stream=file.read(), filetype="pdf")
        for page in pdf:
            text += page.get_text()
        pdf.close()
    elif filename.lower().endswith('.txt'):
        text = file.read().decode('utf-8', errors='ignore')
    else:
        return jsonify({"error": "Unsupported file type."}), 400

    # Improved chunking logic
    chunks = []
    chunk_metadata = []  # Store metadata for each chunk
    
    # First split by paragraphs
    paragraphs = text.split("\n\n")
    current_chunk = []
    current_word_count = 0
    chunk_id = 0
    
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
            
        words = para.split()
        para_word_count = len(words)
        
        if current_word_count + para_word_count > 200:
            # If current chunk is not empty, save it
            if current_chunk:
                chunk_text = " ".join(current_chunk)
                chunks.append(chunk_text)
                chunk_metadata.append({
                    "chunk_id": chunk_id,
                    "word_count": current_word_count,
                    "is_paragraph_boundary": True
                })
                chunk_id += 1
                current_chunk = []
                current_word_count = 0
            
            # If paragraph itself is too long, split it
            if para_word_count > 200:
                for i in range(0, para_word_count, 200):
                    chunk_text = " ".join(words[i:i+200])
                    chunks.append(chunk_text)
                    chunk_metadata.append({
                        "chunk_id": chunk_id,
                        "word_count": len(words[i:i+200]),
                        "is_paragraph_boundary": False
                    })
                    chunk_id += 1
            else:
                # Add the paragraph as a new chunk
                chunks.append(para)
                chunk_metadata.append({
                    "chunk_id": chunk_id,
                    "word_count": para_word_count,
                    "is_paragraph_boundary": True
                })
                chunk_id += 1
        else:
            current_chunk.extend(words)
            current_word_count += para_word_count
    
    # Add the last chunk if it exists
    if current_chunk:
        chunk_text = " ".join(current_chunk)
        chunks.append(chunk_text)
        chunk_metadata.append({
            "chunk_id": chunk_id,
            "word_count": current_word_count,
            "is_paragraph_boundary": True
        })

    # Embed and store with progress tracking
    successful_chunks = 0
    for idx, (chunk, metadata) in enumerate(zip(chunks, chunk_metadata)):
        try:
            print(f"Processing chunk {idx + 1}/{len(chunks)}...")
            # Generate embedding with retry logic
            emb_values = embed_with_retry(EMBED_MODEL, chunk)
            if emb_values is None:
                return jsonify({"error": f"Failed to embed chunk {idx} after multiple retries."}), 500
            
            # Add delay between chunks to avoid rate limits
            if idx < len(chunks) - 1:  # Don't delay after the last chunk
                time.sleep(2)  # 2 second delay between chunks
            
            # Unique ID
            chunk_id = str(uuid.uuid4())
            # Add to ChromaDB with enhanced metadata
            collection.add(
                ids=[chunk_id],
                documents=[chunk],
                embeddings=[emb_values],
                metadatas=[{
                    "source": filename,
                    "chunk": idx,
                    "chunk_id": metadata["chunk_id"],
                    "word_count": metadata["word_count"],
                    "is_paragraph_boundary": metadata["is_paragraph_boundary"]
                }]
            )
            successful_chunks += 1
            print(f"Successfully processed chunk {idx + 1}")
            
        except Exception as e:
            print(f"Error embedding chunk {idx}: {e}")
            return jsonify({"error": f"Failed to embed chunk {idx}. Details: {e}"}), 500

    return jsonify({
        "message": f"Successfully uploaded and indexed {successful_chunks} out of {len(chunks)} chunks.",
        "successful_chunks": successful_chunks,
        "total_chunks": len(chunks)
    })

@app.route('/chat', methods=['POST'])
def chat():
    data = request.get_json()
    query = data.get('message', '')
    if not query:
        return jsonify({"error": "Empty query."}), 400

    try:
        # Embed query with retry logic
        q_emb_values = embed_with_retry(EMBED_MODEL, query)
        if q_emb_values is None:
            return jsonify({"error": "Failed to embed query after multiple retries."}), 500
    except Exception as e:
        print(f"Error embedding query: {e}")
        return jsonify({"error": f"Failed to embed query. Details: {e}"}), 500

    # Retrieve top 3 chunks with their metadata
    results = collection.query(
        query_embeddings=[q_emb_values],
        n_results=3,
        include=["documents", "metadatas", "distances"]
    )
    
    # Extract documents, metadata, and distances
    docs = results['documents'][0]
    metadatas = results['metadatas'][0]
    distances = results['distances'][0]

    # Build prompt with source information
    context_parts = []
    for i, (doc, metadata, distance) in enumerate(zip(docs, metadatas, distances)):
        context_parts.append(doc)
    
    context = "\n\n".join(context_parts)
    prompt = (
        f"Use the following context to answer the question. Provide a clear and concise answer "
        f"based on the given information.\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {query}\nAnswer:"
    )

    try:
        # Generate response with retry logic
        answer = generate_with_retry(GEN_MODEL, prompt)
        if answer is None:
            return jsonify({"error": "Failed to generate response after multiple retries."}), 500
    except Exception as e:
        print(f"Error generating response: {e}")
        return jsonify({"error": f"Failed to generate response. Details: {e}"}), 500

    # Prepare source information for the response
    sources = []
    for i, (doc, metadata, distance) in enumerate(zip(docs, metadatas, distances)):
        sources.append({
            "source": metadata.get('source', 'Unknown source'),
            "chunk": metadata.get('chunk', 'Unknown chunk'),
            "word_count": metadata.get('word_count', 'Unknown'),
            "is_paragraph": metadata.get('is_paragraph_boundary', False),
            "relevance": 1 - distance,  # Convert distance to similarity score
            "content": doc
        })

    return jsonify({
        "answer": answer,
        "sources": sources
    })

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        name = request.form['name']
        email = request.form['email']
        password = request.form['password']

        if email in users:
            return render_template('login.html', register_message='User already exists. Please login.', show_register=True)

        hashed_password = generate_password_hash(password)
        users[email] = {'name': name, 'password': hashed_password}
        return render_template('login.html', register_message='Registration successful! Please login.', show_login=True)

    return render_template('login.html', show_register=True)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']

        user = users.get(email)

        if user and check_password_hash(user['password'], password):
            session['logged_in'] = True
            session['email'] = email
            return redirect(url_for('home'))
        else:
            return render_template('login.html', login_error='Invalid email or password', show_login=True)

    return render_template('login.html', show_login=True)

@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    session.pop('email', None)
    return redirect(url_for('login'))

if __name__ == '__main__':
    app.run(debug=True)