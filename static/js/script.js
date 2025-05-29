// Preload the pop sound
const popSound = new Audio('/static/sounds/pop-cartoon-328167.mp3');
popSound.preload = 'auto';

// Chat memory management
const CHAT_MEMORY_KEY = 'chat_history';

let currentSources = [];
let usedChunkIds = new Set();

// Function to play feedback (sound + vibration)
function playFeedback() {
    // Play sound
    popSound.currentTime = 0;
    popSound.play().catch(error => console.log('Audio playback failed:', error));
    
    // Vibrate if supported
    if (navigator.vibrate) {
        navigator.vibrate(50);
    }
}

async function uploadDocument() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    if (!file) return;
  
    const formData = new FormData();
    formData.append('file', file);
  
    const res = await fetch('/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    document.getElementById('uploadStatus').innerText = data.message || data.error;
    
    // Play feedback on successful upload
    if (!data.error) {
        playFeedback();
    }
}
  
// Function to scroll chat window to bottom
function scrollToBottom() {
    const chatWindow = document.querySelector('.chat-window');
    if (chatWindow) {
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
}

// Function to save chat to memory
function saveChatToMemory() {
    const chatMessages = document.getElementById('chatMessages');
    const messages = [];
    
    // Get all message rows
    const messageRows = chatMessages.getElementsByClassName('message-row');
    
    // Convert each message to a storable format
    for (let row of messageRows) {
        const bubble = row.querySelector('.bot-bubble, .user-bubble');
        const avatar = row.querySelector('.avatar');
        if (bubble && avatar) {
            messages.push({
                text: bubble.textContent,
                sender: avatar.classList.contains('user-avatar') ? 'user' : 'bot',
                timestamp: new Date().toISOString()
            });
        }
    }
    
    // Save to localStorage
    localStorage.setItem(CHAT_MEMORY_KEY, JSON.stringify(messages));
}

// Function to load chat from memory
function loadChatFromMemory() {
    const savedChat = localStorage.getItem(CHAT_MEMORY_KEY);
    if (savedChat) {
        const messages = JSON.parse(savedChat);
        messages.forEach(msg => {
            addMessage(msg.text, msg.sender, false); // false to prevent saving again
        });
    }
}

function addMessage(text, sender, shouldSave = true) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message-row ${sender}-message`;
    
    const avatar = document.createElement('div');
    avatar.className = `avatar ${sender}-avatar`;
    avatar.textContent = sender === 'user' ? 'U' : 'B';
    
    const bubble = document.createElement('div');
    bubble.className = `${sender}-bubble`;
    bubble.textContent = text;
    
    // Add click handler to bot messages
    if (sender === 'bot') {
        bubble.style.cursor = 'pointer';
        bubble.addEventListener('click', () => {
            scrollToSource();
        });
    }
    
    // Add elements to message div
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(bubble);
    
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom with smooth animation
    setTimeout(scrollToBottom, 100);
    
    // Save to memory if needed
    if (shouldSave) {
        saveChatToMemory();
    }
}
  
function updateSourceDisplay() {
    const sourceContent = document.getElementById('sourceContent');
    const totalChunks = document.getElementById('totalChunks');
    const usedChunks = document.getElementById('usedChunks');
    const showOnlyUsed = document.getElementById('showOnlyUsed').checked;
    
    // Update stats
    totalChunks.textContent = `Total Chunks: ${currentSources.length}`;
    usedChunks.textContent = `Used Chunks: ${usedChunkIds.size}`;
    
    // Clear existing content
    sourceContent.innerHTML = '';
    
    // Filter sources if needed
    const sourcesToShow = showOnlyUsed 
        ? currentSources.filter(source => usedChunkIds.has(source.chunk))
        : currentSources;
    
    // Create source chunks
    sourcesToShow.forEach(source => {
        const chunkDiv = document.createElement('div');
        chunkDiv.className = `source-chunk ${usedChunkIds.has(source.chunk) ? 'used' : ''}`;
        
        // Create header with metadata
        const header = document.createElement('div');
        header.className = 'source-chunk-header';
        
        const info = document.createElement('div');
        info.className = 'source-chunk-info';
        info.innerHTML = `
            <span>Source: ${source.source}</span>
            <span>Chunk #${source.chunk}</span>
            <span>Words: ${source.word_count}</span>
            ${source.is_paragraph ? '<span>Complete Paragraph</span>' : ''}
            <span>Relevance: ${(source.relevance * 100).toFixed(1)}%</span>
        `;
        
        header.appendChild(info);
        chunkDiv.appendChild(header);
        
        // Add content
        const content = document.createElement('div');
        content.className = 'source-chunk-content';
        content.textContent = source.content;
        chunkDiv.appendChild(content);
        
        sourceContent.appendChild(chunkDiv);
    });
}

function handleChatResponse(response) {
    const chatMessages = document.getElementById('chatMessages');
    const botMessage = document.createElement('div');
    botMessage.className = 'message-row bot-message';
    
    // Add bot avatar
    const avatar = document.createElement('div');
    avatar.className = 'avatar bot-avatar';
    avatar.textContent = 'B';
    botMessage.appendChild(avatar);
    
    // Add message bubble
    const bubble = document.createElement('div');
    bubble.className = 'bot-bubble';
    bubble.textContent = response.answer;
    botMessage.appendChild(bubble);
    
    chatMessages.appendChild(botMessage);
    
    // Update sources
    if (response.sources) {
        currentSources = response.sources;
        response.sources.forEach(source => {
            usedChunkIds.add(source.chunk);
        });
        updateSourceDisplay();
    }
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Add event listeners for source controls
document.getElementById('toggleSource').addEventListener('click', function() {
    const sourceWindow = document.getElementById('sourceDocsWindow');
    const isVisible = sourceWindow.style.display !== 'none';
    sourceWindow.style.display = isVisible ? 'none' : 'block';
    this.textContent = isVisible ? 'Show Sources' : 'Hide Sources';
});

document.getElementById('clearSources').addEventListener('click', function() {
    currentSources = [];
    usedChunkIds.clear();
    updateSourceDisplay();
});

document.getElementById('showOnlyUsed').addEventListener('change', updateSourceDisplay);

// Update the sendMessage function
async function sendMessage() {
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();
    
    if (!message) return;
    
    // Add user message to chat
    const chatMessages = document.getElementById('chatMessages');
    const userMessage = document.createElement('div');
    userMessage.className = 'message-row user-message';
    
    const avatar = document.createElement('div');
    avatar.className = 'avatar user-avatar';
    avatar.textContent = 'U';
    userMessage.appendChild(avatar);
    
    const bubble = document.createElement('div');
    bubble.className = 'user-bubble';
    bubble.textContent = message;
    userMessage.appendChild(bubble);
    
    chatMessages.appendChild(userMessage);
    userInput.value = '';
    
    // Show typing indicator
    const typingIndicator = document.getElementById('typingIndicator');
    typingIndicator.style.display = 'block';
    
    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            handleChatResponse(data);
        } else {
            throw new Error(data.error || 'Failed to get response');
        }
    } catch (error) {
        console.error('Error:', error);
        const errorMessage = document.createElement('div');
        errorMessage.className = 'message-row bot-message error';
        errorMessage.innerHTML = `
            <div class="avatar bot-avatar">B</div>
            <div class="bot-bubble">Sorry, I encountered an error: ${error.message}</div>
        `;
        chatMessages.appendChild(errorMessage);
    } finally {
        typingIndicator.style.display = 'none';
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}
  
// Function to smoothly scroll to source section
function scrollToSource() {
    const sourceSection = document.querySelector('.source-docs-section');
    if (sourceSection) {
        sourceSection.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
        });
        // Add highlight effect
        sourceSection.style.transition = 'background-color 0.3s ease';
        sourceSection.style.backgroundColor = 'var(--main-purple-light)';
        setTimeout(() => {
            sourceSection.style.backgroundColor = '';
        }, 1000);
    }
}
  
// Optional: allow Enter key to send message
document.getElementById('userInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault(); // Prevent default form submission
        sendMessage();
    }
});

// Theme toggle functionality
const themeToggle = document.getElementById('toggleTheme');
const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

// Set initial theme based on system preference or saved preference
const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
    document.documentElement.dataset.theme = savedTheme;
    updateThemeButton(savedTheme);
} else if (prefersDarkScheme.matches) {
    document.documentElement.dataset.theme = 'dark';
    updateThemeButton('dark');
}

// Toggle theme on button click
themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.dataset.theme;
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.dataset.theme = newTheme;
    localStorage.setItem('theme', newTheme);
    updateThemeButton(newTheme);
});

// Update theme button text based on current theme
function updateThemeButton(theme) {
    themeToggle.textContent = theme === 'light' ? 'Dark' : 'Light';
}

function toggleUploadCard() {
    const uploadCard = document.getElementById('uploadCard');
    uploadCard.style.display = 'block';
    // Use setTimeout to ensure the display:block takes effect before adding the class
    setTimeout(() => {
        uploadCard.classList.toggle('visible');
        // Play feedback when toggling upload card
        playFeedback();
    }, 10);
}

// Close upload card when clicking outside
document.addEventListener('click', function(event) {
    const uploadCard = document.getElementById('uploadCard');
    const fab = document.getElementById('uploadFab');
    
    if (!uploadCard.contains(event.target) && !fab.contains(event.target)) {
        uploadCard.classList.remove('visible');
        // Hide the card after animation completes
        setTimeout(() => {
            if (!uploadCard.classList.contains('visible')) {
                uploadCard.style.display = 'none';
            }
        }, 300);
    }
});

// Add scroll event listener to chat window
document.addEventListener('DOMContentLoaded', function() {
    // Load chat history
    loadChatFromMemory();
    
    // Add clear chat button
    const clearButton = document.createElement('button');
    clearButton.className = 'clear-chat';
    clearButton.innerHTML = '<span class="clear-icon">×</span>';
    clearButton.title = 'Clear Chat History';
    clearButton.addEventListener('click', clearChatHistory);
    document.body.appendChild(clearButton);
    
    // Initial scroll to bottom
    scrollToBottom();
    
    // Add scroll event listener
    const chatWindow = document.querySelector('.chat-window');
    if (chatWindow) {
        chatWindow.addEventListener('scroll', function() {
            // Store scroll position
            const isAtBottom = chatWindow.scrollHeight - chatWindow.scrollTop === chatWindow.clientHeight;
            chatWindow.dataset.wasAtBottom = isAtBottom;
        });
    }
});

// Clear chat history with confirmation
function clearChatHistory() {
    // Create confirmation dialog
    const dialog = document.createElement('div');
    dialog.className = 'clear-confirmation';
    dialog.innerHTML = `
        <p>Are you sure you want to clear the chat history?</p>
        <div class="clear-confirmation-buttons">
            <button class="confirm-clear">Yes, Clear</button>
            <button class="cancel-clear">Cancel</button>
        </div>
    `;
    
    // Add to body
    document.body.appendChild(dialog);
    
    // Add event listeners
    dialog.querySelector('.confirm-clear').addEventListener('click', () => {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = '';
        localStorage.removeItem(CHAT_MEMORY_KEY);
        document.body.removeChild(dialog);
        // Play feedback
        playFeedback();
    });
    
    dialog.querySelector('.cancel-clear').addEventListener('click', () => {
        document.body.removeChild(dialog);
    });
    
    // Close on outside click
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            document.body.removeChild(dialog);
        }
    });
  }