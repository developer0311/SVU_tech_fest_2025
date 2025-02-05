-- Users Table (For attendees, organizers, and admins)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    fname VARCHAR(100) NOT NULL,
    lname VARCHAR(100) NOT NULL,
    phone VARCHAR(15) UNIQUE DEFAULT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role VARCHAR(50) CHECK (role IN ('attendee', 'organizer', 'admin')) DEFAULT 'attendee',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events Table (For scheduling both events and activities)
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100), -- E.g., 'Workshop', 'Competition', 'Seminar'
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    location VARCHAR(255),
    speaker VARCHAR(255) DEFAULT NULL, -- Speaker/Host Name
    banner_image TEXT DEFAULT NULL,
    max_capacity INT DEFAULT NULL,
    registration_deadline TIMESTAMP DEFAULT NULL,
    registration_type VARCHAR(50) CHECK (registration_type IN ('single', 'team', 'both')) DEFAULT 'single', -- Registration type
    event_type VARCHAR(50) CHECK (event_type IN ('event', 'activity')) NOT NULL, -- Distinguish between events and activities
    activity_image TEXT DEFAULT NULL, -- For activities only
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teams Table (For team-based registrations for events)
CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL, -- Team name
    event_id INT REFERENCES events(id) ON DELETE CASCADE, -- Link to the event or activity
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Registrations Table (Tracks user registrations for events)
CREATE TABLE registrations (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    event_id INT REFERENCES events(id) ON DELETE CASCADE, -- Link to event or activity
    team_id INT REFERENCES teams(id) ON DELETE SET NULL, -- Link to teams for group registrations
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sponsors Table (For managing event sponsors)
CREATE TABLE sponsors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    logo_url TEXT DEFAULT NULL,
    website_url TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Gallery Table (Stores event images)
CREATE TABLE gallery (
    id SERIAL PRIMARY KEY,
    image_url TEXT NOT NULL,
    description TEXT,
    uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    like_count INT DEFAULT 0,               -- New field for likes
    comment_count INT DEFAULT 0,            -- New field for the number of comments
    share_count INT DEFAULT 0,              -- New field for the number of shares
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

------------------------------- POST_LIKES TABLE -------------------------------

CREATE TABLE post_likes (
    id SERIAL PRIMARY KEY,
    post_id INT REFERENCES gallery(id) ON DELETE CASCADE,  -- Updated to reference gallery(id)
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(10) CHECK (action IN ('like', 'dislike')) NOT NULL,
    liked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

------------------------------- POST_COMMENTS TABLE -------------------------------

CREATE TABLE post_comments (
    id SERIAL PRIMARY KEY,
    post_id INT REFERENCES gallery(id) ON DELETE CASCADE,  -- Updated to reference gallery(id)
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    commented_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contacts Table (For user queries)
CREATE TABLE contacts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin Logs Table (Tracks admin actions)
CREATE TABLE admin_logs (
    id SERIAL PRIMARY KEY,
    admin_id INT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications Table (To notify users about updates)
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments Table (For event ticket payments if needed)
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    event_id INT REFERENCES events(id) ON DELETE CASCADE, -- Link to event or activity
    team_id INT REFERENCES teams(id) ON DELETE SET NULL, -- Link to team for group payments
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) CHECK (status IN ('pending', 'completed', 'failed')) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Event Feedback Table (For event/feedback reviews)
CREATE TABLE event_feedback (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    event_id INT REFERENCES events(id) ON DELETE CASCADE, -- Link to event or activity
    feedback TEXT,
    rating INT CHECK (rating >= 1 AND rating <= 5),
    feedback_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



-- Disable foreign key checks to avoid constraint errors during table drops
DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    -- Loop through all tables and drop them
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') 
    LOOP 
        EXECUTE 'DROP TABLE IF EXISTS public.' || r.tablename || ' CASCADE'; 
    END LOOP; 
END $$;
