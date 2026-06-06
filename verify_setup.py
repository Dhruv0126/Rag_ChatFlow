"""Quick verification script for Rag_Chatbot dependencies and API."""
import sys

import numpy as np
np.float_ = np.float64  # ChromaDB compatibility on NumPy 2.x (must run before chromadb import)

def check(name, fn):
    try:
        result = fn()
        print(f"[OK] {name}: {result}")
        return True
    except Exception as e:
        print(f"[FAIL] {name}: {e}")
        return False

passed = 0
total = 0

def run(name, fn):
    global passed, total
    total += 1
    if check(name, fn):
        passed += 1

# 1. Core imports
run("numpy", lambda: f"v{__import__('numpy').__version__}")
run("flask", lambda: f"v{__import__('flask').__version__}")
run("groq", lambda: f"v{__import__('groq').__version__}")
run("chromadb", lambda: f"v{__import__('chromadb').__version__}")
run("fitz (PyMuPDF)", lambda: f"v{__import__('fitz').__version__}")
run("sentence_transformers", lambda: f"v{__import__('sentence_transformers').__version__}")

# 2. Environment
import os
from dotenv import load_dotenv
load_dotenv()
run("GROQ_API_KEY set", lambda: "yes" if os.getenv("GROQ_API_KEY") else "missing")

# 3. NumPy/ChromaDB compatibility
import numpy as np
np.float_ = np.float64
run("numpy float_ alias", lambda: str(np.float_))

# 4. Embeddings
def test_embed():
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("all-MiniLM-L6-v2")
    emb = model.encode("test sentence", convert_to_numpy=True)
    return f"{len(emb)} dimensions"
run("local embeddings", test_embed)

# 5. ChromaDB
def test_chroma():
    import chromadb
    from chromadb.config import Settings, DEFAULT_TENANT, DEFAULT_DATABASE
    client = chromadb.PersistentClient(
        path="chroma_db",
        settings=Settings(),
        tenant=DEFAULT_TENANT,
        database=DEFAULT_DATABASE,
    )
    cols = [c.name for c in client.list_collections()]
    return f"collections: {cols}"
run("chromadb", test_chroma)

# 6. Groq API
def test_groq():
    from groq import Groq
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": "Reply with exactly: OK"}],
        max_tokens=10,
    )
    return resp.choices[0].message.content.strip()
run("groq API", test_groq)

print(f"\nResult: {passed}/{total} checks passed")
sys.exit(0 if passed == total else 1)
