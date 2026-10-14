const API_BASE = 'http://localhost:5000/api';
let authToken = localStorage.getItem('authToken');
let currentArtwork = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadArtworks();
    setupHamburger();
    if (authToken) {
        showDashboard();
    }
});

// Hamburger menu
function setupHamburger() {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.querySelector('.nav-menu');
    hamburger.addEventListener('click', () => {
        navMenu.classList.toggle('active');
    });
}

// Navigation
function navigateTo(page) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(p => p.classList.remove('active'));

    let targetPage;
    switch(page) {
        case 'home':
            targetPage = document.getElementById('home-page');
            break;
        case 'oil':
            targetPage = document.getElementById('oil-page');
            loadArtworksByCategory('Oil Painting', 'oil-artworks');
            break;
        case 'other':
            targetPage = document.getElementById('other-page');
            loadOtherMedia();
            break;
        case 'admin':
            targetPage = document.getElementById('admin-page');
            if (authToken) {
                loadAdminArtworks();
            }
            break;
        default:
            targetPage = document.getElementById('home-page');
    }

    if (targetPage) {
        targetPage.classList.add('active');
        window.scrollTo(0, 0);
    }

    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    event.target.classList.add('active');
}

// Load all artworks
function loadArtworks() {
    fetch(`${API_BASE}/artworks`)
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('featured-artworks');
            if (container && data.length > 0) {
                container.innerHTML = data.slice(0, 6).map(artwork => createArtworkCard(artwork)).join('');
            }
        })
        .catch(err => console.error('Error loading artworks:', err));
}

// Load artworks by category
function loadArtworksByCategory(category, containerId) {
    fetch(`${API_BASE}/artworks?category=${encodeURIComponent(category)}`)
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = data.length > 0
                    ? data.map(artwork => createArtworkCard(artwork)).join('')
                    : '<p style="text-align: center; grid-column: 1/-1;">No artworks in this category yet.</p>';
            }
        })
        .catch(err => console.error('Error loading artworks:', err));
}

// Load other media (not oil paintings)
function loadOtherMedia() {
    fetch(`${API_BASE}/artworks`)
        .then(res => res.json())
        .then(data => {
            const otherWorks = data.filter(a => a.category !== 'Oil Painting');
            const container = document.getElementById('other-artworks');
            if (container) {
                container.innerHTML = otherWorks.length > 0
                    ? otherWorks.map(artwork => createArtworkCard(artwork)).join('')
                    : '<p style="text-align: center; grid-column: 1/-1;">No artworks in this category yet.</p>';
            }
        })
        .catch(err => console.error('Error loading artworks:', err));
}

// Create artwork card
function createArtworkCard(artwork) {
    const price = artwork.price > 0 ? `$${artwork.price.toFixed(2)}` : 'Contact for pricing';
    return `
        <div class="artwork-card" onclick="openModal(${artwork.id})">
            <img src="${artwork.image_path}" alt="${artwork.title}" class="artwork-image">
            <div class="artwork-info">
                <h3 class="artwork-title">${artwork.title}</h3>
                <span class="artwork-category">${artwork.category}</span>
                ${artwork.description ? `<p class="artwork-description">${artwork.description}</p>` : ''}
                <p class="artwork-price">${price}</p>
            </div>
        </div>
    `;
}

// Modal functions
function openModal(id) {
    fetch(`${API_BASE}/artworks/${id}`)
        .then(res => res.json())
        .then(artwork => {
            currentArtwork = artwork;
            document.getElementById('modal-image').src = artwork.image_path;
            document.getElementById('modal-title').textContent = artwork.title;
            document.getElementById('modal-description').textContent = artwork.description || 'No description available';
            document.getElementById('modal-category').textContent = artwork.category;
            const priceText = artwork.price > 0 ? `$${artwork.price.toFixed(2)}` : 'Contact for pricing';
            document.getElementById('modal-price').textContent = priceText;
            document.getElementById('artwork-modal').style.display = 'block';
        })
        .catch(err => console.error('Error loading artwork:', err));
}

function closeModal() {
    document.getElementById('artwork-modal').style.display = 'none';
}

function addToCart() {
    if (currentArtwork) {
        showNotification(`Added "${currentArtwork.title}" to cart!`, 'success');
        closeModal();
    }
}

// Admin functions
function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.token) {
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            showNotification('Login successful!', 'success');
            showDashboard();
            loadAdminArtworks();
        } else {
            showNotification(data.message || 'Login failed', 'error');
        }
    })
    .catch(err => {
        showNotification('Login error: ' + err.message, 'error');
    });
}

function logout() {
    authToken = null;
    localStorage.removeItem('authToken');
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    showNotification('Logged out successfully', 'success');
}

function showDashboard() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
}

function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(`${tab}-tab`).classList.add('active');
    event.target.classList.add('active');
}

function handleUpload(event) {
    event.preventDefault();

    const formData = new FormData();
    formData.append('title', document.getElementById('artwork-title').value);
    formData.append('description', document.getElementById('artwork-description').value);
    formData.append('category', document.getElementById('artwork-category').value);
    formData.append('price', document.getElementById('artwork-price').value || 0);
    formData.append('image', document.getElementById('artwork-image').files[0]);

    fetch(`${API_BASE}/artworks`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`
        },
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        if (data.message) {
            showNotification('Artwork uploaded successfully!', 'success');
            event.target.reset();
            loadAdminArtworks();
        } else {
            showNotification(data.message || 'Upload failed', 'error');
        }
    })
    .catch(err => {
        showNotification('Upload error: ' + err.message, 'error');
    });
}

function loadAdminArtworks() {
    fetch(`${API_BASE}/admin/artworks`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById('manage-artworks-list');
        container.innerHTML = data.map(artwork => `
            <div class="manage-item">
                <img src="${artwork.image_path}" alt="${artwork.title}" class="manage-item-image">
                <div class="manage-item-details">
                    <h4>${artwork.title}</h4>
                    <p><strong>Category:</strong> ${artwork.category}</p>
                    <p><strong>Price:</strong> ${artwork.price > 0 ? '$' + artwork.price.toFixed(2) : 'Contact for pricing'}</p>
                    <p><strong>Status:</strong> ${artwork.available ? 'Available' : 'Archived'}</p>
                    <p>${artwork.description || 'No description'}</p>
                    <div class="manage-item-actions">
                        <button class="btn btn-primary" onclick="editArtwork(${artwork.id})">Edit</button>
                        <button class="btn btn-secondary" onclick="deleteArtwork(${artwork.id})">Delete</button>
                    </div>
                </div>
            </div>
        `).join('');
    })
    .catch(err => console.error('Error loading admin artworks:', err));
}

function deleteArtwork(id) {
    if (confirm('Are you sure you want to delete this artwork?')) {
        fetch(`${API_BASE}/artworks/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        })
        .then(res => res.json())
        .then(data => {
            showNotification('Artwork deleted successfully', 'success');
            loadAdminArtworks();
            loadArtworks();
        })
        .catch(err => showNotification('Error deleting artwork: ' + err.message, 'error'));
    }
}

function editArtwork(id) {
    showNotification('Edit feature coming soon!', 'warning');
}

function handleChangePassword(event) {
    event.preventDefault();

    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword !== confirmPassword) {
        showNotification('Passwords do not match', 'error');
        return;
    }

    fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ oldPassword, newPassword })
    })
    .then(res => res.json())
    .then(data => {
        if (data.message) {
            showNotification('Password changed successfully!', 'success');
            event.target.reset();
        } else {
            showNotification(data.message || 'Password change failed', 'error');
        }
    })
    .catch(err => showNotification('Error: ' + err.message, 'error'));
}

// Notification
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 4000);
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('artwork-modal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
}
