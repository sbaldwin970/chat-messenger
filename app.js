var express = require('express')
// var app = module.exports = express()
var app = express()
module.exports = app

app.use(express.static(__dirname + '/public'));

/** Express Session Setup **/
var session = require('express-session')
app.sessionMiddleware = session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true,
})
app.use(app.sessionMiddleware)

/** End Express Session Setup **/


/** Body Parser Setup **/
var bodyParser = require('body-parser')
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
/** End Body Parser Setup **/

/** Database setup **/
var mongoose = require('mongoose')
mongoose.connect('mongodb://localhost/chat')

var userSchema = mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});
var User = mongoose.model('user', userSchema);
/** End database setup **/


/** Passport Config **/
var bcrypt = require('bcryptjs')
var passport = require('passport')
var LocalStrategy = require('passport-local').Strategy;
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, done) {
    done(null, user.id);
});
passport.deserializeUser(function(id, done) {
    User.findById(id, function(err, user) {
        done(err, user);
    });
});

// When someone tries to log in to our site, how do we determine that they are who they say they are?
passport.use(new LocalStrategy(
    function(username, password, done) {
        User.findOne({ username: username }, function (err, user) {
            if (err) { return done(err); }
            if (!user) {
                return done(null, false, { message: 'Incorrect username.' });
            }
            // If we got this far, then we know that the user exists. But did they put in the right password?
            bcrypt.compare(password, user.password, function(error, response){
                if (response === true){
                    return done(null,user)
                }
                else {
                    return done(null, false)
                }
            })
        });
    }
));

app.isAuthenticated = function(req, res, next){
    // If the current user is logged in...
    if(req.isAuthenticated()){
    // Middleware allows the execution chain to continue.
        return next();
    }
    // If not, redirect to login
    res.redirect('/');
}


app.isAuthenticatedAjax = function(req, res, next){
    // If the current user is logged in...
    if(req.isAuthenticated()){
    // Middleware allows the execution chain to continue.
        return next();
    }
    // If not, redirect to login
    res.send({error:'not logged in'});
}

app.isSteveAuthenticated = function(req, res, next){
    // If the current user is logged in...
    if(req.isAuthenticated() && req.user.username === 'steve'){
    // Middleware allows the execution chain to continue.
        return next();
    }
    // If not, redirect to login
    res.redirect('/');
}
/** End Passport Config **/

var midFunc = function(req, res, next){
    console.log('middleware!')
    return next()
}
app.get('/', midFunc, midFunc, function(req, res){
    console.log('endpoint!')
    res.sendFile('/html/login.html', {root: './public'})
})


app.post('/signup', function(req, res){
    bcrypt.genSalt(10, function(error, salt){
        bcrypt.hash(req.body.password, salt, function(hashError, hash){
            var newUser = new User({
                username: req.body.username,
                password: hash,
            });
            newUser.save(function(saveErr, user){
                if ( saveErr ) { res.send({ err:saveErr }) }
                else { 
                    req.login(user, function(loginErr){
                        if ( loginErr ) { res.send({ err:loginErr }) }
                        else { res.send({success: 'success'}) }
                    })
                }
            })
            
        })
    })
})

app.post('/login', function(req, res, next){
    passport.authenticate('local', function(err, user, info) {
        if (err) { return next(err); }
        if (!user) { return res.send({error : 'something went wrong :('}); }
        req.logIn(user, function(err) {
            if (err) { return next(err); }
            return res.send({success:'success'});
        });
    })(req, res, next);
})


// 2 kinds of middleware
// app.use is like 'vertical middleware'. They get evaluated from top to bottom.
// there is also inline, or 'horizontal' middleware.
app.get('/chat', app.isAuthenticated, function(req, res){
    res.sendFile('/html/chat.html', {root: './public'})
})

app.get('/api/me', app.isAuthenticatedAjax, function(req, res){
    res.send({user:req.user})
})


// app.listen RETURNS a server object. Normally we don't care, but we need it this time for our socket server.
app.server = app.listen(3000)



var io = require("socket.io")
var loggedInUsers = {}
var socketServer = io(app.server)


// express middleware
// function(req, res, next)

// socket.io middleware
// function(socket, next)  - socket object has socket.request

socketServer.use(function(socket, next){
    app.sessionMiddleware(socket.request, {}, next);
})

// socket servers can proactively emit messages for no reason!
// setInterval(function(){socketServer.emit('chatMessage',{content:'hi!'})},400)

// the `socket` object in the callback function represents the socket connection for a single user.
socketServer.on("connection", function(socket){
    // make sure the socket connection is authenticated.
    if ( socket.request.session && socket.request.session.passport && socket.request.session.passport.user ) {
        // this is our SERIALIZED user, a.k.a. just the user's mongo ID.
        var id = socket.request.session.passport.user
        User.findById(id, function(error, user){

            // console.log('socket user: ', user)
            loggedInUsers[user.username] = true;
            // console.log('whos logged in? ', loggedInUsers)
            socketServer.emit('loggedInUsers', loggedInUsers)


            socket.on('chatMessage', function(data){
                console.log('message to server!', data)
                socketServer.emit('chatMessage', {sender:user.username,content:data})

            })

            
            socket.join(user.username)
            socket.on('whisper', function(data){
                // console.log('whisper ', data)
                // console.log(loggedInUsers)
                socketServer.to(data.recipient).emit('whisper', {
                    sender  : user.username,
                    content : data.content
                })
            })

            socket.on('disconnect', function(){
                console.log('user disconnected');
                loggedInUsers[user.username] = false;
                socketServer.emit('loggedInUsers', loggedInUsers)

            });
        })
    }

})
