# Stevensosmoore - Artist Portfolio Website

A professional, modern art portfolio website for Stevensosmoore, featuring oil paintings, acrylics, charcoal, and mixed media works with an admin dashboard for managing artwork listings.

## Features

✨ **Gallery Pages**
- Oil Paintings gallery (for sale)
- Other Media gallery (Acrylics, Charcoal, Mixed Media, etc.)
- Featured works on home page
- Beautiful responsive design

🎨 **Professional Design**
- Clean, modern interface
- Smooth animations and transitions
- Mobile-responsive layout
- Professional color scheme

🔐 **Admin Dashboard**
- Secure login system
- Upload new artworks with images
- Manage existing artworks
- Change password functionality
- View all artworks with pricing

💰 **E-commerce Features**
- Product pricing management
- Add to cart functionality
- Professional product cards
- Detailed artwork views

📱 **Responsive Design**
- Works on desktop, tablet, and mobile
- Touch-friendly interface
- Optimized images

🔗 **Social Integration**
- Instagram link in navigation
- Direct links to social profiles

## Tech Stack

**Backend:**
- Node.js with Express.js
- SQLite3 database
- JWT authentication
- Bcrypt password hashing
- Multer for file uploads

**Frontend:**
- HTML5
- CSS3 with CSS Grid and Flexbox
- Vanilla JavaScript
- Responsive design

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm

### Setup Steps

1. **Navigate to the project directory:**
```bash
cd /home/user/Stevensosmoore
```

2. **Install dependencies:**
```bash
npm install
```

3. **Start the server:**
```bash
npm start
```

The server will run on `http://localhost:5000`

## Project Structure

```
/
├── public/
│   ├── index.html         # Main HTML file
│   ├── styles.css         # All styling
│   ├── app.js            # Frontend JavaScript
│   ├── uploads/          # Uploaded artwork images
│   └── ...
├── data/
│   └── art_portfolio.db  # SQLite database
├── server.js             # Express backend
├── package.json          # Dependencies
├── .env                  # Environment variables
└── README.md            # This file
```

## Usage

### Access the Website
- **Home**: http://localhost:5000
- **Oil Paintings**: http://localhost:5000/oil-paintings
- **Other Media**: http://localhost:5000/other-media
- **Admin Panel**: http://localhost:5000/admin

### Default Admin Credentials
- **Username**: `admin`
- **Password**: `password123`

⚠️ **IMPORTANT**: Change the default password immediately after first login for security.

### Admin Dashboard

#### Upload Artwork
1. Go to Admin > Upload Artwork tab
2. Fill in:
   - Title
   - Description
   - Category (Oil Painting, Acrylic, Charcoal, Mixed Media, Drawing)
   - Price (optional)
   - Upload image file
3. Click "Upload Artwork"

#### Manage Artworks
1. Go to Admin > Manage Artworks tab
2. View all uploaded artworks
3. Delete artworks (archived, not permanently deleted)
4. Edit functionality coming soon

#### Account Settings
1. Go to Admin > Settings tab
2. Change your admin password
3. Enter old password, new password, and confirm

## API Endpoints

### Authentication
- `POST /api/auth/login` - Admin login
- `POST /api/auth/change-password` - Change admin password

### Artworks
- `GET /api/artworks` - Get all public artworks
- `GET /api/artworks?category=Oil Painting` - Get artworks by category
- `GET /api/artworks/:id` - Get single artwork details
- `POST /api/artworks` - Upload new artwork (requires auth)
- `PUT /api/artworks/:id` - Update artwork (requires auth)
- `DELETE /api/artworks/:id` - Delete artwork (requires auth)
- `GET /api/admin/artworks` - Get all artworks including archived (requires auth)

## Categories

Artworks can be organized into these categories:
- Oil Painting
- Acrylic
- Charcoal
- Mixed Media
- Drawing

## Customization

### Change Colors
Edit the CSS variables in `public/styles.css`:
```css
:root {
    --primary-color: #2c3e50;        /* Main color */
    --secondary-color: #d4a574;      /* Accent color */
    --accent-color: #e8b4a8;         /* Additional accent */
    --text-color: #333;              /* Text color */
    --light-bg: #f8f7f4;            /* Light background */
}
```

### Change Artist Name
Update in `public/index.html`:
- `.logo-text` - Main name in navigation
- `<title>` - Browser tab title
- About section content

### Change Social Links
Update Instagram link in `public/index.html`:
```html
<a href="https://instagram.com/YOUR_HANDLE" target="_blank">
```

## Security Notes

1. **Change Default Password**: The default admin password must be changed immediately
2. **Use HTTPS**: In production, always use HTTPS
3. **JWT Secret**: Change the `JWT_SECRET` in `.env` file
4. **Database**: Keep the database file secure and backed up
5. **Image Uploads**: Validate image files on the server (already done)

## Deployment

### For Production:

1. **Update environment variables:**
```bash
cp .env.example .env
# Edit .env with production values
```

2. **Set NODE_ENV:**
```bash
NODE_ENV=production
```

3. **Use a process manager:**
```bash
npm install -g pm2
pm2 start server.js --name "art-portfolio"
```

4. **Setup reverse proxy** (Nginx/Apache)

5. **Use HTTPS** with SSL certificate

## Features to Add

- [ ] Image editing/cropping
- [ ] Advanced search and filtering
- [ ] Wish list functionality
- [ ] Customer reviews/ratings
- [ ] Email notifications
- [ ] Payment integration (Stripe, PayPal)
- [ ] Blog/news section
- [ ] Contact form
- [ ] Analytics tracking

## Troubleshooting

### Port Already in Use
```bash
# On Linux/Mac
lsof -i :5000
kill -9 <PID>

# On Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

### Database Issues
Delete the database file and restart:
```bash
rm data/art_portfolio.db
npm start
```

### Image Upload Not Working
Ensure the `public/uploads` directory exists and is writable:
```bash
mkdir -p public/uploads
chmod 755 public/uploads
```

## Support & Contact

- **Instagram**: @STEVENSOSMOORE
- **Email**: gibson.moore@duke.edu
- **Duke University** - Student Artist

## License

© 2024 Stevensosmoore. All rights reserved.

## Notes for Development

- Frontend runs on port 5000
- Backend API also on port 5000 (same server)
- All uploads are stored in `public/uploads/`
- Database is SQLite for simplicity and portability
- JWT tokens expire after 7 days
- Artworks are soft-deleted (archived) not permanently removed

---

**Built with ❤️ for the art community**
