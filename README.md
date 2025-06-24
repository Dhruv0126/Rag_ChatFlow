# RAG Chatbot Documentation

## Project Overview
This is a Retrieval-Augmented Generation (RAG) chatbot that combines document processing, semantic search, and AI-powered responses. The system allows users to upload documents (PDF/TXT), processes them into chunks, and uses them as a knowledge base for answering questions.

## Live Demo

[https://rag-chatflow-dhruv0126.onrender.com](https://rag-chatflow-dhruv0126.onrender.com)

## Architecture

### 1. Frontend Components
- **User Interface**
  - Modern, responsive chat interface
  - Dark/Light theme support
  - Document upload functionality
  - Real-time chat interaction
  - Source text display with chunk highlighting

- **Key Features**
  - Document upload with progress tracking
  - Interactive chat window
  - Source text visualization
  - Theme switching
  - Chat history management
  - Responsive design for all devices

### 2. Backend Components
- **Document Processing**
  - PDF and TXT file support
  - Smart text chunking (200 words or paragraph-wise)
  - Metadata tracking for each chunk
  - Progress tracking during upload

- **Vector Database (ChromaDB)**
  - Persistent storage of document chunks
  - 3072-dimensional embeddings
  - Cosine similarity search
  - Metadata storage for each chunk

- **AI Integration (Google Gemini)**
  - Text embedding using `gemini-embedding-exp-03-07`
  - Response generation using `gemini-2.0-flash`
  - Rate limit handling with retry logic
  - Error handling and fallback mechanisms

### 3. Authentication System
- User registration and login
- Session management
- Password hashing for security
- Protected routes

## Technical Implementation

### 1. Document Processing Pipeline
```python
1. File Upload
   - Accept PDF/TXT files
   - Extract text content
   - Validate file format

2. Text Chunking
   - Split by paragraphs
   - Maintain paragraph boundaries when possible
   - Split large paragraphs into 200-word chunks
   - Track chunk metadata (source, word count, paragraph status)

3. Embedding Generation
   - Generate embeddings for each chunk
   - Implement retry logic for rate limits
   - Store embeddings in ChromaDB
```

### 2. Query Processing Pipeline
```python
1. Query Embedding
   - Convert user question to embedding
   - Use same embedding model as documents

2. Similarity Search
   - Find most relevant chunks
   - Retrieve top 3 matches
   - Include metadata and relevance scores

3. Response Generation
   - Build context from relevant chunks
   - Generate response using Gemini
   - Return answer with source information
```

### 3. Frontend-Backend Communication
```javascript
1. Document Upload
   - FormData submission
   - Progress tracking
   - Error handling

2. Chat Interaction
   - Real-time message exchange
   - Source text updates
   - Error handling and retry logic

3. UI Updates
   - Dynamic message rendering
   - Source text highlighting
   - Theme switching
```

## Key Features in Detail

### 1. Smart Document Processing
- **Chunking Strategy**
  - Preserves paragraph boundaries
  - Combines small paragraphs
  - Splits large paragraphs
  - Tracks word count and paragraph status

- **Metadata Tracking**
  - Source file information
  - Chunk numbering
  - Word count
  - Paragraph status
  - Relevance scores

### 2. Enhanced Search
- **Semantic Search**
  - Uses 3072-dimensional embeddings
  - Cosine similarity matching
  - Top-k retrieval
  - Relevance scoring

- **Source Tracking**
  - Tracks which chunks were used
  - Shows relevance scores
  - Highlights used chunks
  - Provides source context

### 3. User Experience
- **Chat Interface**
  - Real-time message updates
  - Typing indicators
  - Message animations
  - Error handling

- **Source Display**
  - Collapsible source panel
  - Chunk highlighting
  - Relevance scores
  - Word count display

- **Theme Support**
  - Light/Dark mode
  - Persistent theme preference
  - Smooth transitions
  - Consistent styling

## Setup and Deployment

### 1. Prerequisites
```bash
- Python 3.8+
- Node.js (for development)
- Google Gemini API key
- Virtual environment
```

### 2. Installation
```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
.venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt
```

### 3. Configuration
```python
# Required environment variables
GEMINI_API_KEY=your_api_key
SECRET_KEY=your_secret_key
```

### 4. Running the Application
```bash
# Development
python app.py

# Production
gunicorn app:app
```

## Error Handling

### 1. API Rate Limits
- Exponential backoff retry
- Maximum retry attempts
- Delay between chunks
- Error reporting

### 2. File Processing
- Format validation
- Size limits
- Encoding handling
- Error messages

### 3. User Input
- Input validation
- Error messages
- Fallback responses
- Session handling

## Future Improvements

### 1. Planned Features
- Multiple document support
- Document versioning
- Advanced search filters
- Export chat history

### 2. Performance Optimizations
- Caching mechanisms
- Batch processing
- Async operations
- Query optimization

### 3. User Experience
- Advanced analytics
- Custom themes
- Keyboard shortcuts
- Mobile app

## Contributing
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request
