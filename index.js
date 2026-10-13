const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const md5 = require('md5'); // Used for the bonus challenge

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'my_secret_key',
    resave: false,
    saveUninitialized: false
}));

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'BlogDB',
    password: '', 
    port: 5432,
});

function requireLogin(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/signin');
    }
}


// 1. Sign Up Page (GET & POST)
app.get('/signup', (req, res) => {
    res.render('signup', { error: null });
});

app.post('/signup', async (req, res) => {
    const { user_id, password, name } = req.body;
    

    // BONUS CHALLENGE: Hashing the password using MD5 before storing it
    const hashedPassword = md5(password);

    try {
        const checkUser = await pool.query('SELECT * FROM users WHERE user_id = $1', [user_id]);
        if (checkUser.rows.length > 0) {
            res.render('signup', { error: 'User ID already taken. Please choose another.' });
        } else {

            // BONUS CHALLENGE: Inserting the hashed password into the database instead of plain text
            await pool.query('INSERT INTO users (user_id, password, name) VALUES ($1, $2, $3)', [user_id, hashedPassword, name]);
            res.redirect('/signin');
        }
    } catch (err) {
        console.error(err);
        res.send("Database error");
    }
});

// 2. Sign In Page (GET & POST)
app.get('/signin', (req, res) => {
    res.render('signin', { error: null });
});

app.post('/signin', async (req, res) => {
    const { user_id, password } = req.body;
    
    // BONUS CHALLENGE: Hash the inputted password to compare it with the stored hash
    const hashedPassword = md5(password);

    try {
        const user = await pool.query('SELECT * FROM users WHERE user_id = $1 AND password = $2', [user_id, hashedPassword]);
        if (user.rows.length > 0) {
            req.session.userId = user.rows[0].user_id;
            req.session.userName = user.rows[0].name;
            res.redirect('/');
        } else {
            res.render('signin', { error: 'Invalid User ID or Password.' });
        }
    } catch (err) {
        console.error(err);
        res.send("Database error");
    }
});

// 3. Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/signin');
});

// 4. Home page / Blog Feed
app.get('/', requireLogin, async (req, res) => {
    try {
        const blogs = await pool.query('SELECT * FROM blogs ORDER BY date_created DESC');
        res.render('index', { 
            posts: blogs.rows, 
            currentUser: req.session.userId,
            currentUserName: req.session.userName
        });
    } catch (err) {
        console.error(err);
        res.send("Database error");
    }
});

// 5. Create a new post
app.post('/add', requireLogin, async (req, res) => {
    const { title, body } = req.body;
    try {
        await pool.query(
            'INSERT INTO blogs (creator_name, creator_user_id, title, body) VALUES ($1, $2, $3, $4)', 
            [req.session.userName, req.session.userId, title, body]
        );
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.send("Database error");
    }
});

// 6. Show Edit Form
app.get('/edit/:id', requireLogin, async (req, res) => {
    const postId = req.params.id;
    try {
        const blog = await pool.query('SELECT * FROM blogs WHERE blog_id = $1', [postId]);
        if (blog.rows.length > 0 && blog.rows[0].creator_user_id === req.session.userId) {
            res.render('edit', { post: blog.rows[0] });
        } else {
            res.send("You can only edit your own posts.");
        }
    } catch (err) {
        console.error(err);
        res.send("Database error");
    }
});

// 7. Save Edited Post
app.post('/edit/:id', requireLogin, async (req, res) => {
    const postId = req.params.id;
    const { title, body } = req.body;
    try {
        await pool.query(
            'UPDATE blogs SET title = $1, body = $2 WHERE blog_id = $3 AND creator_user_id = $4', 
            [title, body, postId, req.session.userId]
        );
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.send("Database error");
    }
});

// 8. Delete Post
app.post('/delete/:id', requireLogin, async (req, res) => {
    const postId = req.params.id;
    try {
        await pool.query('DELETE FROM blogs WHERE blog_id = $1 AND creator_user_id = $2', [postId, req.session.userId]);
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.send("Database error");
    }
});

// BONUS CHALLENGE: Account Settings Page
app.get('/account', requireLogin, async (req, res) => {
    res.render('account', { currentUser: req.session.userId, error: null, success: null });
});

app.post('/account', requireLogin, async (req, res) => {
    const { new_user_id, new_password } = req.body;
    const old_user_id = req.session.userId;
    const hashedPassword = md5(new_password);

    try {
        // Check if the new user ID is already taken by someone else
        const checkUser = await pool.query('SELECT * FROM users WHERE user_id = $1 AND user_id != $2', [new_user_id, old_user_id]);
        if (checkUser.rows.length > 0) {
            return res.render('account', { currentUser: req.session.userId, error: 'User ID is already taken.', success: null });
        }

        // Update the user table. Because we used ON UPDATE CASCADE in SQL, the blogs table will automatically update!
        await pool.query(
            'UPDATE users SET user_id = $1, password = $2 WHERE user_id = $3', 
            [new_user_id, hashedPassword, old_user_id]
        );

        // Update the current session with the new ID
        req.session.userId = new_user_id;

        res.render('account', { currentUser: req.session.userId, error: null, success: 'Account updated successfully!' });
    } catch (err) {
        console.error(err);
        res.send("Database error");
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});