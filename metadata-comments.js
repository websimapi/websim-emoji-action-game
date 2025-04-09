// Variables to store metadata state
let metadataRoom = null; 
let performEmojiActionCallback = null;
let currentProjectId = null;
let commentsContainer = null;
let commentInput = null;
let commentSubmit = null;

// Initialize metadata comments handling
async function initializeMetadataComments(roomInstance, emojiActionCallback) {
  metadataRoom = roomInstance;
  performEmojiActionCallback = emojiActionCallback;
  commentsContainer = document.getElementById('comments-container');
  commentInput = document.querySelector('.comment-input');
  commentSubmit = document.querySelector('.comment-submit');

  // Get current project info
  const project = await window.websim.getCurrentProject();
  if (project) {
    currentProjectId = project.id;
    
    // Load initial comments
    await loadMetadataComments();
    
    // Set up event listener for comment submission
    commentSubmit.addEventListener('click', submitMetadataComment);
    
    // Set up polling for new comments every 10 seconds
    setInterval(loadMetadataComments, 10000);
  } else {
    commentsContainer.innerHTML = '<div class="comment">Failed to load project information</div>';
  }
}

// Load comments from the Websim API
async function loadMetadataComments() {
  if (!currentProjectId) return;
  
  // Show loading indicator
  if (commentsContainer.children.length === 0) {
    commentsContainer.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div></div>';
  }
  
  try {
    const response = await fetch(`/api/v1/projects/${currentProjectId}/comments`);
    if (!response.ok) throw new Error('Failed to fetch comments');
    
    const data = await response.json();
    renderMetadataComments(data.comments.data);
  } catch (error) {
    console.error('Error loading comments:', error);
    if (commentsContainer.querySelector('.loading-container')) {
      commentsContainer.innerHTML = '<div class="comment">Failed to load comments</div>';
    }
  }
}

// Render the metadata comments
function renderMetadataComments(comments) {
  commentsContainer.innerHTML = '';
  
  if (comments.length === 0) {
    commentsContainer.innerHTML = '<div class="comment">No comments yet. Be the first to comment!</div>';
    return;
  }
  
  comments.forEach(({ comment }) => {
    const commentElement = createMetadataCommentElement(comment);
    commentsContainer.appendChild(commentElement);
  });
}

// Create a DOM element for a metadata comment
function createMetadataCommentElement(comment) {
  const element = document.createElement('div');
  element.className = 'comment';
  element.dataset.id = comment.id;
  
  const header = document.createElement('div');
  header.className = 'comment-header';
  
  const avatar = document.createElement('img');
  avatar.className = 'metadata-avatar';
  avatar.src = comment.author.avatar_url || `https://images.websim.ai/avatar/${comment.author.username}`;
  avatar.alt = comment.author.username;
  
  const username = document.createElement('div');
  username.className = 'metadata-username';
  username.textContent = `@${comment.author.username}`;
  
  const timestamp = document.createElement('div');
  timestamp.className = 'metadata-timestamp';
  timestamp.textContent = new Date(comment.created_at).toLocaleString();
  
  header.appendChild(avatar);
  header.appendChild(username);
  header.appendChild(timestamp);
  
  const content = document.createElement('div');
  content.className = 'comment-content';
  
  // Handle different content formats
  if (comment.content && comment.content.children) {
    // Process structured content
    let plainText = '';
    processDocumentNodes(comment.content.children, (text) => {
      plainText += text;
    });
    content.textContent = plainText;
  } else if (comment.raw_content) {
    // Just use raw content if available
    content.textContent = comment.raw_content;
  } else {
    content.textContent = '[No content]';
  }
  
  const reactions = document.createElement('div');
  reactions.className = 'comment-reactions';
  
  // Add existing reactions
  if (comment.reactions && comment.reactions.length) {
    comment.reactions.forEach(reaction => {
      const reactionElement = createReactionElement(reaction.emoji.name, reaction.count, reaction.me);
      reactionElement.addEventListener('click', () => addMetadataReaction(comment.id, reaction.emoji.name));
      reactions.appendChild(reactionElement);
    });
  }
  
  const addReactionBtn = document.createElement('button');
  addReactionBtn.id = 'add-reaction-btn';
  addReactionBtn.textContent = 'Add Reaction';
  addReactionBtn.addEventListener('click', (e) => {
    window.gameLogic.openEmojiPicker(comment.id, e);
  });
  
  element.appendChild(header);
  element.appendChild(content);
  element.appendChild(reactions);
  element.appendChild(addReactionBtn);
  
  return element;
}

// Process document nodes recursively to extract text
function processDocumentNodes(nodes, textCallback) {
  if (!nodes || !Array.isArray(nodes)) return;
  
  nodes.forEach(node => {
    if (node.type === 'text') {
      textCallback(node.text);
    } else if (node.type === 'paragraph' && node.children) {
      processDocumentNodes(node.children, textCallback);
    } else if (node.type === 'link' && node.children) {
      processDocumentNodes(node.children, textCallback);
    } else if (node.type === 'list' && node.children) {
      processDocumentNodes(node.children, textCallback);
    } else if (node.type === 'list_item' && node.children) {
      processDocumentNodes(node.children, textCallback);
    }
  });
}

// Create a reaction DOM element
function createReactionElement(emoji, count, isMyReaction) {
  const element = document.createElement('div');
  element.className = 'reaction';
  if (isMyReaction) {
    element.style.backgroundColor = '#bb86fc33';
  }
  
  const emojiSpan = document.createElement('span');
  emojiSpan.textContent = emoji;
  
  const countSpan = document.createElement('span');
  countSpan.className = 'reaction-count';
  countSpan.textContent = count;
  
  element.appendChild(emojiSpan);
  element.appendChild(countSpan);
  
  return element;
}

// Add a reaction to a metadata comment
async function addMetadataReaction(commentId, emoji) {
  if (!currentProjectId || !commentId) return;
  
  try {
    // Check if we already reacted with this emoji
    const response = await fetch(`/api/v1/projects/${currentProjectId}/comments/${commentId}/reactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ emoji })
    });
    
    if (!response.ok) throw new Error('Failed to add reaction');
    
    // Reload comments to show updated reactions
    await loadMetadataComments();
    
    // Perform the emoji action
    if (performEmojiActionCallback) {
      performEmojiActionCallback(emoji);
    }
    
    // Log the action
    window.gameLogic.logAction(`You reacted with ${emoji} to a comment`);
  } catch (error) {
    console.error('Error adding reaction:', error);
    window.gameLogic.logAction(`Failed to add reaction ${emoji}`);
  }
}

// Submit a new metadata comment
async function submitMetadataComment() {
  const content = commentInput.value.trim();
  if (!content || !currentProjectId) return;
  
  try {
    const response = await fetch(`/api/v1/projects/${currentProjectId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content })
    });
    
    if (!response.ok) throw new Error('Failed to post comment');
    
    // Clear input and reload comments
    commentInput.value = '';
    await loadMetadataComments();
    
    window.gameLogic.logAction('You posted a new comment');
  } catch (error) {
    console.error('Error posting comment:', error);
    window.gameLogic.logAction('Failed to post comment');
  }
}

// Make functions available globally
window.addMetadataReaction = addMetadataReaction;
window.initializeMetadataComments = initializeMetadataComments;