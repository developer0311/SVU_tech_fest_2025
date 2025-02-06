import express from "express";
import bodyParser from "body-parser";
import { dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import session from "express-session";
import nodemailer from "nodemailer";
import Razorpay from "razorpay";
import "dotenv/config";

const app = express();
const port = process.env.SERVER_PORT;
const __dirname = dirname(fileURLToPath(import.meta.url));
const saltRounds = 10;
const admin_password = process.env.ADMIN_PASSWORD;
const RAZORPAY_ID_KEY = process.env.RAZORPAY_ID_KEY;
const RAZORPAY_SECRET_KEY = process.env.RAZORPAY_SECRET_KEY;
let home_active = "active";
let cart_active = "";

app.set("view engine", "ejs");

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 600000 },
  })
);

app.use(express.static("public"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(passport.initialize());
app.use(passport.session());

const razorpayInstance = new Razorpay({
  key_id: RAZORPAY_ID_KEY,
  key_secret: RAZORPAY_SECRET_KEY,
});

const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});
db.connect();

app.get("/", (req, res) => {
  const username = req.isAuthenticated()
    ? get_username(req.user.email)
    : "Guest";
  res.render(__dirname + "/views/home.ejs");
});

//-------------------------- INDEX Routes --------------------------//

app.get(
  "/auth/google/home",
  passport.authenticate("google", {
    successRedirect: "/home",
    failureRedirect: "/login",
  })
);

app.get("/home", async (req, res) => {
  const username = req.isAuthenticated()
    ? get_username(req.user.email)
    : "Guest";
  res.render(__dirname + "/views/index.ejs");
});

//-------------------------- SCHEDULE Routes --------------------------//

app.get("/schedule", async (req, res) => {
  const username = req.isAuthenticated()
    ? get_username(req.user.email)
    : "Guest";
  const m_result = await db.query(
    "SELECT * FROM events WHERE start_time >= $1 and event_type = $2 ORDER BY start_time ASC",
    [new Date(), `event`] // Fetch events that are starting now or in the future
  );

  res.render(__dirname + "/views/schedule.ejs", { events: m_result.rows });
});

//-------------------------- SCHEDULE Routes --------------------------//

app.get("/activity", async (req, res) => {
  const username = req.isAuthenticated()
    ? get_username(req.user.email)
    : "Guest";
  const m_result = await db.query(
    "SELECT * FROM events WHERE start_time >= $1 and event_type = $2 ORDER BY start_time ASC",
    [new Date(), `activity`] // Fetch events that are starting now or in the future
  );

  res.render(__dirname + "/views/schedule.ejs", { events: m_result.rows });
});

//-------------------------- GALLERY Routes --------------------------//

app.get("/gallery", async (req, res) => {
  try {
    const user_id = 1; // Authenticated user

    const posts = await db.query(`
      SELECT 
          g.id AS post_id,
          u.id AS user_id,
          u.fname,
          u.lname,
          u.email,
          g.image_url,
          g.description,
          g.like_count,
          g.comment_count,
          g.share_count,
          -- Check if the current user liked the post, even if they didn't like it
          COALESCE(pl.action = 'like', false) AS user_liked,
          -- Aggregate comments for each post (will return empty array if no comments)
          COALESCE(
              JSON_AGG(
                  JSON_BUILD_OBJECT(
                      'comment_id', pc.id,
                      'comment', pc.comment,
                      'commented_at', pc.commented_at,
                      'user_id', uc.id,
                      'username', uc.fname || ' ' || uc.lname
                  )
              ) FILTER (WHERE pc.id IS NOT NULL), '[]'
          ) AS comments
      FROM gallery g
      JOIN users u ON g.uploaded_by = u.id
      -- Left join to check if the current user has liked the post (this will include all posts, even without likes)
      LEFT JOIN post_likes pl ON g.id = pl.post_id AND pl.user_id = $1
      -- Left join to get all comments for the post
      LEFT JOIN post_comments pc ON g.id = pc.post_id
      -- Left join to get the usernames of the commenters
      LEFT JOIN users uc ON pc.user_id = uc.id
      GROUP BY g.id, u.id, u.fname, u.lname, u.email, pl.action
      ORDER BY g.created_at DESC;
    `, [user_id]);
    

    res.render(__dirname + "/views/gallery", {
      user: 1,
      posts: posts.rows,
    });
  } catch (error) {
    console.error("Error fetching gallery:", error);
    res.status(500).send("Server Error");
  }
});

app.get("/profile", async(req, res) =>{
  const user_result = await db.query(`SELECT * from users WHERE id = $1`,[1]);
  const events = await db.query(`
    SELECT * FROM events 
    JOIN registrations ON events.id =registrations.event_id
    WHERE registrations.user_id = $1
`, [1]);

res.render(__dirname + '/views/profile', { user: user_result.rows[0], events: events.rows });
});


//-------------------------- LIKE and DISLIKE Routes --------------------------//
 
app.post("/like", async (req, res) => {
  const userId = 1; // Assuming user ID is stored in session (use session management in your app)
  const postId = req.body.post_id; // Get post ID from the body of the request

  if (!userId || !postId) {
    return res.status(400).send("User ID and Post ID are required.");
  }

  try {
    // Check if user exists
    const userExistsResult = await db.query(
      "SELECT id FROM users WHERE id = $1",
      [userId]
    );
    if (userExistsResult.rows.length === 0) {
      return res.status(400).send("User does not exist.");
    }

    // Check if post exists
    const postExistsResult = await db.query(
      "SELECT id, like_count FROM gallery WHERE id = $1",
      [postId]
    );
    if (postExistsResult.rows.length === 0) {
      return res.status(400).send("Post does not exist.");
    }

    // Check if the user has already liked or disliked the post
    const likeResult = await db.query(
      "SELECT action FROM post_likes WHERE user_id = $1 AND post_id = $2",
      [userId, postId]
    );

    let action;
    let newLikeCount;

    if (likeResult.rows.length > 0) {
      // User has already liked/disliked the post
      const currentAction = likeResult.rows[0].action;

      if (currentAction === "like") {
        // Change to dislike
        await db.query(
          "UPDATE post_likes SET action = $1 WHERE user_id = $2 AND post_id = $3",
          ["dislike", userId, postId]
        );
        // Decrement the like count
        const decrementResult = await db.query(
          "UPDATE gallery SET like_count = like_count - 1 WHERE id = $1 RETURNING like_count",
          [postId]
        );
        newLikeCount = decrementResult.rows[0].like_count;
      } else {
        // Change to like
        await db.query(
          "UPDATE post_likes SET action = $1 WHERE user_id = $2 AND post_id = $3",
          ["like", userId, postId]
        );
        // Increment the like count
        const incrementResult = await db.query(
          "UPDATE gallery SET like_count = like_count + 1 WHERE id = $1 RETURNING like_count",
          [postId]
        );
        newLikeCount = incrementResult.rows[0].like_count;
      }
    } else {
      // User has not yet liked or disliked the post, so insert a new like
      await db.query(
        "INSERT INTO post_likes (user_id, post_id, action) VALUES ($1, $2, $3)",
        [userId, postId, "like"]
      );
      // Increment the like count
      const incrementResult = await db.query(
        "UPDATE gallery SET like_count = like_count + 1 WHERE id = $1 RETURNING like_count",
        [postId]
      );
      newLikeCount = incrementResult.rows[0].like_count;
    }

    // Send the updated like count as a JSON response for UI update
    res.json({ like_count: newLikeCount });
  } catch (err) {
    console.error("Error handling like/dislike", err);
    res.status(500).send("Internal Server Error");
  }
});


//-------------------------- COMMENT Routes --------------------------//

app.post("/comment", async (req, res) => {
  const user = req.user;
  const { post_id, comment } = req.body

  console.log(comment);
  
  if (!user.id || !post_id || !comment) {
    console.log(user_id);
    console.log(post_id_id);
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  try {
    await db.query(
      "INSERT INTO post_comments (user_id, post_id, comment, commented_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)",
      [user.id, post_id, comment]
    );

    await db.query(
      "UPDATE gallery SET comment_count = comment_count + 1 WHERE id = $1",
      [post_id]
    );

    const commentCountResult = await db.query(
      "SELECT comment_count FROM gallery WHERE id = $1",
      [post_id]
    );

    res.json({
      success: true,
      fname: user.fname,
      lname: user.lname,
      comment_count: commentCountResult.rows[0].comment_count
    });
  } catch (err) {
    console.error("Error saving comment", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});


//-------------------------- REGISTER Routes --------------------------//

app.get("/register", (req, res) => {
  const username = req.isAuthenticated()
    ? get_username(req.user.email)
    : "Guest";
  res.render(__dirname + "/views/register.ejs");
});

//-------------------------- LOGIN Routes --------------------------//

app.get("/login", (req, res) => {
  const username = req.isAuthenticated()
    ? get_username(req.user.email)
    : "Guest";
  res.render(__dirname + "/views/login.ejs");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
