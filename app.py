import numpy as np
np.float_ = np.float64  # ChromaDB compatibility on NumPy 2.x

import os
import uuid
import time
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from flask_cors import CORS
import fitz  # PyMuPDF
from groq import Groq
import chromadb
from chromadb.config import Settings, DEFAULT_TENANT, DEFAULT_DATABASE
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
from sentence_transformers import SentenceTransformer

# Load environment variables from .env file
load_dotenv()

# ----- Configuration -----
app = Flask(__name__, static_folder='static')
app.secret_key = os.environ.get('SECRET_KEY', 'a_very_secret_key_for_development')
CORS(app)

users = {}

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise EnvironmentError("Please set the GROQ_API_KEY environment variable.")

groq_client = Groq(api_key=GROQ_API_KEY)
GEN_MODEL = "llama-3.3-70b-versatile"

# Local embeddings (Groq does not provide an embedding API)
EMBED_MODEL_NAME = "all-MiniLM-L6-v2"
embedder = SentenceTransformer(EMBED_MODEL_NAME)
EMBEDDING_DIMENSION = embedder.get_sentence_embedding_dimension()

# Initialize ChromaDB persistent client
client_db = chromadb.PersistentClient(
    path="chroma_db",
    settings=Settings(),
    tenant=DEFAULT_TENANT,
    database=DEFAULT_DATABASE,
)

COLLECTION_NAME = "documents"
COLLECTION_META = {
    "hnsw:space": "cosine",
    "embedding_model": EMBED_MODEL_NAME,
    "embedding_dimension": EMBEDDING_DIMENSION,
}


def get_or_reset_collection():
    """Use existing collection or recreate if embedding config changed."""
    try:
        existing = client_db.get_collection(COLLECTION_NAME)
        meta = existing.metadata or {}
        if (
            meta.get("embedding_model") == EMBED_MODEL_NAME
            and meta.get("embedding_dimension") == EMBEDDING_DIMENSION
        ):
            return existing
        print("Embedding model changed; recreating collection...")
        client_db.delete_collection(COLLECTION_NAME)
    except Exception:
        pass

    return client_db.create_collection(
        name=COLLECTION_NAME,
        metadata=COLLECTION_META,
        embedding_function=None,
    )


collection = get_or_reset_collection()
print(f"Using embedding model: {EMBED_MODEL_NAME} ({EMBEDDING_DIMENSION} dimensions)")


def embed_text(text):
    return embedder.encode(text, convert_to_numpy=True).tolist()


def generate_with_retry(prompt, max_retries=3, initial_delay=2):
    """Generate content with retry logic for rate limits."""
    for attempt in range(max_retries):
        try:
            response = groq_client.chat.completions.create(
                model=GEN_MODEL,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.choices[0].message.content
        except Exception as e:
            err = str(e)
            if ("429" in err or "rate" in err.lower()) and attempt < max_retries - 1:
                delay = initial_delay * (2 ** attempt)
                print(f"Rate limit hit, retrying in {delay} seconds...")
                time.sleep(delay)
                continue
            raise
    return None


# Decorator to protect routes
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function


# ----- Routes -----

def _resolve_doc_id(metadata):
    doc_id = metadata.get("doc_id")
    if doc_id:
        return doc_id
    source = metadata.get("source")
    if source:
        return f"legacy::{source}"
    return None


def _doc_query_filter(doc_id):
    if doc_id.startswith("legacy::"):
        return {"source": doc_id.split("legacy::", 1)[1]}
    return {"doc_id": doc_id}


def list_indexed_documents():
    """Return unique uploaded documents grouped by doc_id."""
    if collection.count() == 0:
        return []

    data = collection.get(include=["metadatas"])
    docs = {}
    for metadata in data.get("metadatas") or []:
        doc_id = _resolve_doc_id(metadata)
        if not doc_id:
            continue
        if doc_id not in docs:
            docs[doc_id] = {
                "doc_id": doc_id,
                "source": metadata.get("source", "Unknown"),
                "chunk_count": 0,
            }
        docs[doc_id]["chunk_count"] += 1

    return sorted(docs.values(), key=lambda d: d["source"].lower())


def _session_user_context():
    email = session.get('email', '')
    user = users.get(email, {})
    name = user.get('name') or (email.split('@')[0] if email else 'User')
    parts = [p[0].upper() for p in name.split() if p][:2]
    initials = ''.join(parts) or (email[:2].upper() if email else 'U')
    indexed_docs = list_indexed_documents()
    return {
        'user_name': name,
        'user_email': email,
        'user_initials': initials,
        'doc_count': collection.count(),
        'document_count': len(indexed_docs),
    }


@app.route('/')
def home():
    if 'logged_in' not in session:
        return redirect(url_for('login'))
    return render_template('index.html', **_session_user_context())


@app.route('/stats')
@login_required
def stats():
    indexed_docs = list_indexed_documents()
    return jsonify({
        "doc_count": collection.count(),
        "document_count": len(indexed_docs),
    })


@app.route('/documents')
@login_required
def documents():
    return jsonify({"documents": list_indexed_documents()})


@app.route('/upload', methods=['POST'])
@login_required
def upload():
    file = request.files.get('file')
    if not file:
        return jsonify({"error": "No file uploaded"}), 400
    text = ""
    filename = file.filename

    if filename.lower().endswith('.pdf'):
        pdf = fitz.open(stream=file.read(), filetype="pdf")
        for page in pdf:
            text += page.get_text()
        pdf.close()
    elif filename.lower().endswith('.txt'):
        text = file.read().decode('utf-8', errors='ignore')
    else:
        return jsonify({"error": "Unsupported file type."}), 400

    chunks = []
    chunk_metadata = []

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
            if current_chunk:
                chunk_text = " ".join(current_chunk)
                chunks.append(chunk_text)
                chunk_metadata.append({
                    "chunk_id": chunk_id,
                    "word_count": current_word_count,
                    "is_paragraph_boundary": True,
                })
                chunk_id += 1
                current_chunk = []
                current_word_count = 0

            if para_word_count > 200:
                for i in range(0, para_word_count, 200):
                    chunk_text = " ".join(words[i:i + 200])
                    chunks.append(chunk_text)
                    chunk_metadata.append({
                        "chunk_id": chunk_id,
                        "word_count": len(words[i:i + 200]),
                        "is_paragraph_boundary": False,
                    })
                    chunk_id += 1
            else:
                chunks.append(para)
                chunk_metadata.append({
                    "chunk_id": chunk_id,
                    "word_count": para_word_count,
                    "is_paragraph_boundary": True,
                })
                chunk_id += 1
        else:
            current_chunk.extend(words)
            current_word_count += para_word_count

    if current_chunk:
        chunk_text = " ".join(current_chunk)
        chunks.append(chunk_text)
        chunk_metadata.append({
            "chunk_id": chunk_id,
            "word_count": current_word_count,
            "is_paragraph_boundary": True,
        })

    doc_id = str(uuid.uuid4())
    successful_chunks = 0
    for idx, (chunk, metadata) in enumerate(zip(chunks, chunk_metadata)):
        try:
            print(f"Processing chunk {idx + 1}/{len(chunks)}...")
            emb_values = embed_text(chunk)

            chunk_uuid = str(uuid.uuid4())
            collection.add(
                ids=[chunk_uuid],
                documents=[chunk],
                embeddings=[emb_values],
                metadatas=[{
                    "doc_id": doc_id,
                    "source": filename,
                    "chunk": idx,
                    "chunk_id": metadata["chunk_id"],
                    "word_count": metadata["word_count"],
                    "is_paragraph_boundary": metadata["is_paragraph_boundary"],
                }],
            )
            successful_chunks += 1
            print(f"Successfully processed chunk {idx + 1}")
        except Exception as e:
            print(f"Error embedding chunk {idx}: {e}")
            return jsonify({"error": f"Failed to embed chunk {idx}. Details: {e}"}), 500

    return jsonify({
        "message": f"Successfully uploaded and indexed {successful_chunks} out of {len(chunks)} chunks.",
        "successful_chunks": successful_chunks,
        "total_chunks": len(chunks),
        "doc_id": doc_id,
        "filename": filename,
    })


@app.route('/chat', methods=['POST'])
@login_required
def chat():
    data = request.get_json()
    query = data.get('message', '')
    doc_id = data.get('doc_id', '').strip()
    if not query:
        return jsonify({"error": "Empty query."}), 400
    if not doc_id:
        return jsonify({"error": "No document selected. Please upload or select a document first."}), 400

    indexed_docs = list_indexed_documents()
    if not any(doc["doc_id"] == doc_id for doc in indexed_docs):
        return jsonify({"error": "Selected document was not found. Please upload it again."}), 400

    try:
        q_emb_values = embed_text(query)
    except Exception as e:
        print(f"Error embedding query: {e}")
        return jsonify({"error": f"Failed to embed query. Details: {e}"}), 500

    results = collection.query(
        query_embeddings=[q_emb_values],
        n_results=3,
        where=_doc_query_filter(doc_id),
        include=["documents", "metadatas", "distances"],
    )

    docs = results['documents'][0]
    metadatas = results['metadatas'][0]
    distances = results['distances'][0]

    context_parts = [doc for doc in docs]
    context = "\n\n".join(context_parts)
    prompt = (
        f"Use the following context to answer the question. Provide a clear and concise answer "
        f"based on the given information.\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {query}\nAnswer:"
    )

    try:
        answer = generate_with_retry(prompt)
        if answer is None:
            return jsonify({"error": "Failed to generate response after multiple retries."}), 500
    except Exception as e:
        print(f"Error generating response: {e}")
        return jsonify({"error": f"Failed to generate response. Details: {e}"}), 500

    sources = []
    for doc, metadata, distance in zip(docs, metadatas, distances):
        chunk_idx = metadata.get('chunk', 'Unknown chunk')
        source_doc_id = _resolve_doc_id(metadata) or doc_id
        sources.append({
            "doc_id": source_doc_id,
            "source": metadata.get('source', 'Unknown source'),
            "chunk": chunk_idx,
            "chunk_key": f"{source_doc_id}:{chunk_idx}",
            "word_count": metadata.get('word_count', 'Unknown'),
            "is_paragraph": metadata.get('is_paragraph_boundary', False),
            "relevance": 1 - distance,
            "content": doc,
        })

    return jsonify({
        "answer": answer,
        "sources": sources,
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
