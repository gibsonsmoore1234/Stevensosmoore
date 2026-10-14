# Supabase Setup Guide for Stevensosmoore Art Portfolio

This guide will help you set up the Supabase database and connect it to your Vercel deployment.

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign in or create an account
3. Click "New Project"
4. Enter project details:
   - **Name**: stevensosmoore-portfolio
   - **Password**: Create a strong password
   - **Region**: Choose closest to your users
5. Click "Create new project" and wait for initialization

## Step 2: Get Your Credentials

1. Go to **Settings** → **API**
2. Copy the following:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`

## Step 3: Create Database Tables

Go to **SQL Editor** and run the following SQL:

```sql
-- Create admin_users table
CREATE TABLE admin_users (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create artworks table
CREATE TABLE artworks (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  price DECIMAL(10, 2) DEFAULT 0,
  image_path TEXT NOT NULL,
  available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE artworks ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public artworks reading
CREATE POLICY "Allow public to read available artworks"
  ON artworks
  FOR SELECT
  USING (available = true);

-- Create RLS policies for admin
CREATE POLICY "Allow authenticated admin to read all artworks"
  ON artworks
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can update their own artworks"
  ON artworks
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Admin can delete artworks"
  ON artworks
  FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Admin can insert artworks"
  ON artworks
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
```

## Step 4: Create Storage Bucket

1. Go to **Storage** in the sidebar
2. Click **Create a new bucket**
3. Name it: `artworks`
4. Make it **Public**
5. Click **Create bucket**

Then add the following RLS policies:

Go to **Storage** → **artworks** → **Policies** and allow public reads:

```sql
CREATE POLICY "Allow public to read artworks"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'artworks');

CREATE POLICY "Allow authenticated users to upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'artworks');
```

## Step 5: Add Default Admin User

In **SQL Editor**, run:

```sql
INSERT INTO admin_users (username, password) VALUES (
  'admin',
  '$2a$10$Xb.I/V3JKLsLf7jJXl.Lh.VHcL9Dj/VEMfFI5XzJZOVXqL8Zq7D62'
);
```

**Note**: The password above is the bcrypt hash of "password123". Change it immediately in production!

To generate a new hash, use:
```bash
node -e "console.log(require('bcryptjs').hashSync('YOUR_PASSWORD', 10))"
```

## Step 6: Update Environment Variables

### For Local Development:
1. Create `.env.local` in project root (already exists as template)
2. Fill in your Supabase credentials:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
JWT_SECRET=your-secret-key
```

### For Vercel Production:
1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Add the same variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `JWT_SECRET`

## Step 7: Deploy to Vercel

1. Push your changes to GitHub
2. In Vercel, connect your GitHub repository
3. Vercel will auto-deploy on every push
4. Your site will be available at `https://www.stevensosmoore.com`

## Database Schema

### admin_users
- `id` - Auto-increment primary key
- `username` - Unique username for login
- `password` - Bcrypt hashed password
- `created_at` - Timestamp

### artworks
- `id` - Auto-increment primary key
- `title` - Artwork title
- `description` - Detailed description
- `category` - Oil Painting, Acrylic, Charcoal, Mixed Media, Drawing
- `price` - Artwork price (0 = contact for pricing)
- `image_path` - Public URL to image in storage
- `available` - Boolean (soft delete - false = archived)
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

## Troubleshooting

### "SUPABASE_URL not found"
- Make sure `.env.local` exists in project root
- Verify environment variables are set in Vercel Settings

### "No suitable certificate"
- Use the exact URL from Supabase API settings (should end in .supabase.co)

### Storage uploads failing
- Check that `artworks` bucket is public
- Verify RLS policies are configured
- Ensure authenticated user has INSERT permission

### Admin login not working
- Verify admin user exists: Query `SELECT * FROM admin_users;` in SQL Editor
- Reset password using bcrypt hash as shown above

## Next Steps

1. ✅ Create Supabase project
2. ✅ Set up database tables
3. ✅ Create storage bucket
4. ✅ Add admin user
5. ✅ Configure environment variables
6. ✅ Deploy to Vercel
7. ✅ Upload your artwork photos
8. ✅ Share your portfolio!

## Security Notes

- **Change the default admin password immediately**
- Use a strong, unique `JWT_SECRET` in production
- Keep `SUPABASE_ANON_KEY` private (don't share)
- Enable two-factor authentication on Supabase account
- Regularly backup your artworks and data

## Support

For Supabase issues: https://supabase.com/docs
For Vercel issues: https://vercel.com/docs
For this project: Check the main README.md
