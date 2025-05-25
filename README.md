# RAG Chatbot 🤖

A powerful Retrieval-Augmented Generation (RAG) chatbot that combines the capabilities of large language models with document retrieval to provide accurate and context-aware responses.

## 🌟 Features

- **Document Upload**: Upload and process various document formats
- **Contextual Responses**: Get answers based on your uploaded documents
- **Source Tracking**: View the source documents used for each response
- **Modern UI**: Clean and responsive interface with dark/light mode
- **Chat History**: Automatic saving of chat history in browser
- **Interactive Experience**: Sound effects and visual feedback
- **Mobile Responsive**: Works seamlessly on both desktop and mobile devices

## 🚀 Getting Started

### Prerequisites

- Python 3.8 or higher
- pip (Python package installer)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/Rag_ChatFlow.git
cd Rag_Chatbot
```

2. Create and activate a virtual environment:
```bash
python -m venv .venv
# On Windows
.venv\Scripts\activate
# On macOS/Linux
source .venv/bin/activate
```

3. Install required packages:
```bash
pip install -r requirements.txt
```

### Running the Application

1. Start the Flask server:
```bash
python app.py
```

2. Open your web browser and navigate to:
```
http://localhost:5000
```

## 💡 Usage Guide

1. **Uploading Documents**
   - Click the upload button (bottom right)
   - Select your document file
   - Wait for the upload confirmation

2. **Chatting with the Bot**
   - Type your question in the input field
   - Press Enter or click the send button
   - View the response and source documents

3. **Managing Chat**
   - Use the clear button (top right) to reset the conversation
   - Chat history is automatically saved in your browser
   - Click on bot responses to view source documents

4. **Theme Toggle**
   - Switch between light and dark modes using the theme toggle

## 🛠️ Technical Details

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Python Flask
- **Database**: ChromaDB for vector storage
- **Language Model**: Integration with LLM for responses
- **Document Processing**: Automatic text extraction and chunking

## 📁 Project Structure

```
Rag_Chatbot/
├── app.py              # Main Flask application
├── requirements.txt    # Python dependencies
├── static/            # Static files
│   ├── css/          # Stylesheets
│   ├── js/           # JavaScript files
│   └── sounds/       # Audio files
├── templates/         # HTML templates
└── chroma_db/        # Vector database (gitignored)
```

## 🔒 Security Notes

- The `chroma_db` directory is gitignored as it contains local data
- Sensitive information should not be included in uploaded documents
- Chat history is stored locally in the browser

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with Flask
- Uses ChromaDB for vector storage
- Inspired by modern chat interfaces

