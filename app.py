import os
import uuid
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
collection = client_db.get_or_create_collection(name="documents")

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

    # Chunk text by paragraphs
    paragraphs = text.split("\n\n")
    chunks = []
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(para.split()) > 200:
            # split large paragraphs
            words = para.split()
            for i in range(0, len(words), 200):
                chunks.append(" ".join(words[i:i+200]))
        else:
            chunks.append(para)

    # Embed and store
    for idx, chunk in enumerate(chunks):
        try:
            # Generate embedding
            emb_response = genai_client.models.embed_content(
                model=EMBED_MODEL,
                contents=chunk
            )
            # Extract the actual list of float values from the first (and usually only) embedding in the list
            emb_values = emb_response.embeddings[0].values
        except Exception as e:
            print(f"Error embedding chunk: {e}")
            return jsonify({"error": f"Failed to embed chunk {idx}. Details: {e}"}), 500
        # Unique ID
        chunk_id = str(uuid.uuid4())
        # Add to ChromaDB
        collection.add(
            ids=[chunk_id],
            documents=[chunk],
            embeddings=[emb_values],
            metadatas=[{"source": filename, "chunk": idx}]
        )
    return jsonify({"message": f"Uploaded and indexed {len(chunks)} chunks."})

@app.route('/chat', methods=['POST'])
def chat():
    data = request.get_json()
    query = data.get('message', '')
    if not query:
        return jsonify({"error": "Empty query."}), 400

    try:
        # Embed query
        q_emb_response = genai_client.models.embed_content(
            model=EMBED_MODEL,
            contents=query
        )
        # Extract the actual list of float values from the first (and usually only) embedding in the list
        q_emb_values = q_emb_response.embeddings[0].values
    except Exception as e:
        print(f"Error embedding query: {e}")
        return jsonify({"error": f"Failed to embed query. Details: {e}"}), 500

    # Retrieve top 3 chunks
    results = collection.query(
        query_embeddings=[q_emb_values],
        n_results=3
    )
    docs = results['documents'][0]

    # Build prompt
    context = "\n\n".join(docs)
    prompt = (
        f"Use the following context to answer the question.\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {query}\nAnswer:"
    )

    try:
        # Generate response
        answer = genai_client.models.generate_content(
            model=GEN_MODEL,
            contents=prompt
        ).text
    except Exception as e:
        print(f"Error generating response: {e}")
        return jsonify({"error": f"Failed to generate response. Details: {e}"}), 500

    return jsonify({"answer": answer, "source_docs": docs})

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