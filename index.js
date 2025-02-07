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
let schedule_active = "";
let activity_active = "";
let sponsor_active = "";
let gallery_active = "";
let contact_active = "";

let active_buttons = ["active", "", "", "", "" , "", ""]

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



// ------------------------------------------------------- FUNCTIONS -------------------------------------------------------//

let get_username = (email) => {
  let username = email.split("@")[0];
  return username;
};

let active_page = (pageName) => {
  if (pageName == "home") {
    return ["active", "", "", "", "" , "", ""];

  } else if (pageName == "schedule") {
    return ["", "active", "", "", "" , "", ""];

  } else if (pageName == "activity") {
    return ["", "", "active", "", "" , "", ""];

  } else if (pageName == "sponsors") {
    return ["", "", "", "active", "" , "", ""];

  } else if (pageName == "gallery") {
    return ["", "", "", "" , "active", "", ""];

  } else if (pageName == "contact") {
    return ["", "", "", "", "" , "active", ""];

  } else if (pageName == "profile") {
    return ["", "", "", "", "" , "", "active"];
  }
};


//-------------------------- HOME Routes --------------------------//

app.get("/", (req, res) => {
  const username = req.isAuthenticated()
    ? get_username(req.user.email)
    : "Guest";

  active_buttons = active_page("home");
  res.render(__dirname + "/views/home.ejs", {active_buttons});
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
  active_buttons = active_page("home");
  if (req.isAuthenticated()) {
    try {
      const user = req.user;
      let user_id = user.id;
  
      res.render(__dirname + "/views/index.ejs", {active_buttons});
    } catch (err) {
      console.log(err);
    }
  } else {
    res.redirect("/login");
  }
});

//-------------------------- SCHEDULE Routes --------------------------//

app.get("/schedule", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login"); // Redirect to login if not authenticated
  }

  const username = req.isAuthenticated()
    ? get_username(req.user.email)
    : "Guest";

    active_buttons = active_page("schedule");

  const s_result = await db.query(
    "SELECT * FROM events WHERE start_time >= $1 and event_type = $2 ORDER BY start_time ASC",
    [new Date(), `event`] // Fetch events that are starting now or in the future
  );

  res.render(__dirname + "/views/schedule.ejs", { active_buttons, events: s_result.rows });
});

//-------------------------- SCHEDULE Routes --------------------------//

app.get("/activity", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login"); // Redirect to login if not authenticated
  }

  const username = req.isAuthenticated()
    ? get_username(req.user.email)
    : "Guest";

    active_buttons = active_page("activity");

  const m_result = await db.query(
    "SELECT * FROM events WHERE start_time >= $1 and event_type = $2 ORDER BY start_time ASC",
    [new Date(), `activity`] // Fetch events that are starting now or in the future
  );

  res.render(__dirname + "/views/schedule.ejs", { active_buttons, events: m_result.rows });
});

//-------------------------- GALLERY Routes --------------------------//

app.get("/gallery", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login"); // Redirect to login if not authenticated
  }

  active_buttons = active_page("gallery");

  try {
    const user_id = req.user.id; // Authenticated user

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
      active_buttons,
      user: user_id,
      posts: posts.rows,
    });
  } catch (error) {
    console.error("Error fetching gallery:", error);
    res.status(500).send("Server Error");
  }
});


app.get("/profile", async(req, res) =>{
  if (!req.isAuthenticated()) {
    return res.redirect("/login"); // Redirect to login if not authenticated
  }
  active_buttons = active_page("profile");

  const user_id = req.user.id
  const user_result = await db.query(`SELECT * from users WHERE id = $1`,[user_id]);
  const events = await db.query(`
    SELECT * FROM events 
    JOIN registrations ON events.id =registrations.event_id
    WHERE registrations.user_id = $1
`, [1]);

res.render(__dirname + '/views/profile', { active_buttons,  user: user_result.rows[0], events: events.rows });
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
  
  if (!user.id || !post_id || !comment) {
    console.log(user_id);
    console.log(post_id);
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


app.post('/update-share-count/:id', async (req, res) => {
  const imageId = req.params.id;

  try {
      const result = await db.query(
          "UPDATE gallery SET share_count = share_count + 1 WHERE id = $1 RETURNING share_count",
          [imageId]
      );

      if (result.rowCount > 0) {
          res.json({ success: true, newCount: result.rows[0].share_count });
      } else {
          res.status(404).json({ success: false, message: "Image not found" });
      }
  } catch (error) {
      console.error("Error updating share count:", error);
      res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});


//-------------------------- CONTACT Routes --------------------------//

app.get("/contact", (req, res)=>{
  active_buttons = active_page("contact");
  res.render(__dirname + "/views/contact.ejs", { active_buttons });
});

app.post("/contact", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login"); // Redirect to login if not authenticated
  }

  try {
    const { name, email, message } = req.body;

    // Insert into database and return inserted row
    const result = await db.query(
      "INSERT INTO contacts (name, email, message) VALUES ($1, $2, $3) RETURNING *",
      [name, email, message]
    );


    res.json({ success: true, message: "Message sent successfully!", data: result.rows[0] });
  } catch (err) {
    console.error("Error submitting contact form:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});


//-------------------------- CONTACT Routes --------------------------//

app.get("/sponsors", async (req, res) => {
  try {
    active_buttons = active_page("sponsors");
    const result = await db.query("SELECT * FROM sponsors ORDER BY created_at DESC");
    res.render("sponsors", { active_buttons, sponsors: result.rows });
  } catch (err) {
    console.error("Error fetching sponsors:", err);
    res.status(500).send("Internal Server Error");
  }
});

 
//-------------------------- REGISTER Routes --------------------------//

app.get("/register", (req, res) => {
  const username = req.isAuthenticated()
    ? get_username(req.user.email)
    : "Guest";

    active_buttons = active_page("home");

  res.render(__dirname + "/views/register.ejs", {active_buttons});
});

app.post("/register", async (req, res) => {
  const {  first_name, last_name, phone, email, password, otp} = req.body;

  try {
    // Validate session data for OTP and email
    const storedOtp = req.session.otp;
    const storedEmail = req.session.email;

    if (!storedOtp || !storedEmail) {
      return res.render("register", {
        profile_name: "Guest",
        homeActive: "active",
        cartActive: "",
        errorMessage: "OTP session expired. Please request a new OTP.",
      });
    }

    // Validate OTP and email
    const isOtpValid = await bcrypt.compare(otp, storedOtp);
    if (!isOtpValid) {
      return res.render("register", {
        profile_name: "Guest",
        homeActive: "active",
        cartActive: "",
        errorMessage: "Invalid OTP. Please try again.",
      });
    }

    if (email !== storedEmail) {
      return res.render("register", {
        profile_name: "Guest",
        homeActive: "active",
        cartActive: "",
        errorMessage: "Email mismatch. Please use the correct email.",
      });
    }

    // Check if the user is already registered by email or mobile number
    const checkResult = await db.query(
      "SELECT * FROM users WHERE email = $1 OR phone = $2",
      [email, phone]
    );

    if (checkResult.rows.length > 0) {
      // Determine the specific error
      const existingUser = checkResult.rows[0];
      let errorMessage = "An account with these details already exists.";
      if (existingUser.email === email) {
        errorMessage = "Email is already registered.";
      } else if (existingUser.phone === phone) {
        errorMessage = "Mobile number is already registered.";
      }
      return res.render("register", {
        profile_name: "Guest",
        homeActive: "active",
        cartActive: "",
        errorMessage: errorMessage,
      });
    }

    // Hash the password and register the user
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const result = await db.query(
      `INSERT INTO users (fname, lname, phone, email, password, role)
       VALUES ($1, $2, $3, $4, $5, 'attendee') RETURNING *`,
      [first_name, last_name, phone, email, hashedPassword]
    );

    const user = result.rows[0];

    // Log in the user after registration
    req.login(user, (err) => {
      if (err) {
        console.error("Login error:", err);
        return res.status(500).render("register", {
          profile_name: "Guest",
          homeActive: "active",
          cartActive: "",
          errorMessage: "An error occurred during login. Please try again.",
        });
      }

      console.log("Registration successful");
      return res.redirect("/home");
    });
  } catch (err) {
    console.error("Error during registration:", err);
    return res.status(500).render("register", {
      profile_name: "Guest",
      homeActive: "active",
      cartActive: "",
      errorMessage: "Something went wrong. Please try again later.",
    });
  }
});


//-------------------------- LOGIN Routes --------------------------//

app.get("/login", (req, res) => {
  const username = req.isAuthenticated()
    ? get_username(req.user.email)
    : "Guest";

    active_buttons = active_page("home");

  res.render(__dirname + "/views/login.ejs", {active_buttons});
});

app.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return next(err); // Handle error
    }
    if (!user) {
      // Flash the error message based on the reason provided by `info.message`
      req.flash("error", info.message || "Invalid credentials. Please try again.");
      return res.render("login");
    }
    req.logIn(user, (err) => {
      if (err) {
        return next(err); // Handle error
      }
      return res.redirect("/home"); // Successful login
    });
  })(req, res, next);
});

//-------------------------- LOGOUT Route --------------------------//

app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.get("/profile/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});


//-------------------------- RESET PASSWORD Route --------------------------//

app.get("/reset-password", (req, res) => {
  active_buttons = active_page("home");
  res.render(__dirname + "/views/reset_password.ejs", {
    active_buttons,
    profile_name: "Guest",
  });
});

// when otp requested then it will send otp via smtp
app.post("/send-otp", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res
      .status(400)
      .json({ success: false, error: "Email is required." });
  }

  try {
    // Generate a random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash the OTP before storing it
    const hashedOtp = await bcrypt.hash(otp, 10);

    // Store hashed OTP and email in session
    req.session.otp = hashedOtp;
    req.session.email = email;

    // Configure SMTP transporter
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Email options
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP code is ${otp}. This code is valid for 10 minutes.`,
    };

    // Send email
    await transporter.sendMail(mailOptions);

    // Respond with success
    res.json({ success: true });

  } catch (err) {
    console.error("Error sending OTP:", err);
    res.status(500).json({ success: false, error: "Failed to send OTP." });
  }
});


// when click on submit then check the user given otp with the generated otp, if matched then render new_password.ejs page
app.post("/check-otp", async (req, res) => {
  const { otp } = req.body;

  // Retrieve hashed OTP and email from session
  const hashedOtp = req.session.otp;
  const email = req.session.email;

  if (!hashedOtp || !email) {
    return res.status(400).json({
      success: false,
      error: "OTP session expired. Please request a new OTP.",
    });
  }

  // Verify the OTP
  const isMatch = await bcrypt.compare(otp, hashedOtp);

  if (isMatch) {
    // OTP is correct, render the new password page
    active_buttons = active_page("home");
    res.render("new_password", {
      email: email,
      profile_name: "Guest",
      homeActive: home_active,
      cartActive: cart_active,
    });
  } else {
    // OTP is incorrect
    res.status(400).json({
      success: false,
      error: "Invalid OTP. Please try again.",
    });
  }
});


app.post("/reset-password", async (req, res) => {
  const { password, confirm_password } = req.body;

  if (password !== confirm_password) {
      return res.status(400).json({ success: false, error: "Passwords do not match." });
  }

  const email = req.session.email;
  if (!email) {
      return res.status(400).json({ success: false, error: "Session expired. Please request OTP again." });
  }

  try {
      // Hash the new password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update the password in the database (assuming you have a `users` table with an `email` column)
      await db.query("UPDATE users SET password = $1 WHERE email = $2", [hashedPassword, email]);

      // Optionally, clear the OTP and email session
      delete req.session.otp;
      delete req.session.email;

      res.redirect("/home");
  } catch (err) {
      console.error("Error resetting password:", err);
      res.status(500).json({ success: false, error: "Failed to reset password." });
  }
});

//-------------------------- PASSPORT LOGICS --------------------------//

app.get("/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

passport.use(
  "local",
  new Strategy(async function verify(email, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
      if (result.rows.length === 0) {
        return cb(null, false, { message: "Email not found. Please register." });
      }

      const user = result.rows[0];
      const storedHashedPassword = user.password;

      const valid = await bcrypt.compare(password, storedHashedPassword);
      if (valid) {
        return cb(null, user);
      } else {
        return cb(null, false, { message: "Incorrect password. Please try again." });
      }
    } catch (err) {
      console.log(err);
      return cb(err);
    }
  })
);


passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/home",
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    async (accessToken, refreshToken, profile, cb) => {
      try {
        const result = await db.query("SELECT * FROM users WHERE email = $1", [
          profile.email,
        ]);
        if (result.rows.length === 0) {
          const newUser = await db.query(
            "INSERT INTO users (email, password) VALUES ($1, $2)",
            [profile.email, "google"]
          );
          return cb(null, newUser.rows[0]);
        } else {
          return cb(null, result.rows[0]);
        }
      } catch (err) {
        return cb(err);
      }
    }
  )
);

passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
