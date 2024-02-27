const Plugger = require("pluggers").default;
const plugin = new Plugger("ms-deezer");
const deezerjs = require("deezer-js");
const DeezerStrategy = require('passport-deezer').Strategy;
const passport = require('passport');
const fs = require('fs');
const axios = require('axios');

if (typeof deezerStorage === "undefined" || deezerStorage === null) {
    var DeezerStorage = require('node-localstorage').LocalStorage;
    deezerStorage = new DeezerStorage('./data/deezer');
  }
const deezer_client = new deezerjs.Deezer();

var DEEZER_CLIENT_ID = process.env.DEEZER_CLIENT_ID || "";
var DEEZER_CLIENT_SECRET = process.env.DEEZER_CLIENT_SECRET || "";

plugin.pluginConfig = {
    cool_name: "Deezer",
    name: "ms-deezer",
    oauth2: true,
    redirect_uri: "http://localhost:3000/auth/deezer/callback",
    refresh_needed: true,
}

if(deezerStorage.getItem('accessToken') == null) {
    deezerStorage.setItem('accessToken', 'false');
}

if(deezerStorage.getItem('userid') == null) {
    deezerStorage.setItem('userid', 'false');
}

if(deezerStorage.getItem('username') == null) {
    deezerStorage.setItem('username', 'false');
}

if(deezerStorage.getItem('loggedin') == null) {
    deezerStorage.setItem('loggedin', 'false');
}

passport.serializeUser(function(user, done) {
    done(null, user);
  });
  
passport.deserializeUser(function(obj, done) {
    done(null, obj);
});


plugin.pluginCallbacks.init = () => {
    
    return "Deezer plugin initialized!";
}
  
passport.use(new DeezerStrategy({
    clientID: DEEZER_CLIENT_ID,
    clientSecret: DEEZER_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/deezer/callback",
    scope: ['basic_access', 'email', 'offline_access', 'manage_library']
  },
  function(accessToken, refreshToken, profile, done) {
    // asynchronous verification, for effect...
    process.nextTick(function () {

        // To keep the example simple, the user's Deezer profile is returned to
        // represent the logged-in user.  In a typical application, you would want
        // to associate the Deezer account with a user record in your database,
        // and return that user instead.
        deezerStorage.setItem('loggedin', 'true');
        deezerStorage.setItem('accessToken', accessToken);
        deezerStorage.setItem('userid', profile.id);
        deezerStorage.setItem('username', profile.displayName);
        return done(null, profile);
    });
  }
));



function isLogged() {
    return deezerStorage.getItem('loggedin') == 'true';
}

async function search(query) {
    const response = await fetch(`https://api.deezer.com/search?q=${query}`);
    const data = await response.json();
    return data;
}


plugin.pluginCallbacks.search = (query) => {
    return search(query);
}

/**
 * Create a playlist and return the playlist id
 * @param {name} name name of the playlist
 */
plugin.pluginCallbacks.create_playlist = (name) => {
    if(!isLogged()) { console.log("You're not logged to " + this.pluginConfig.cool_name); return false; }
    return axios.post('https://api.deezer.com/user/' + deezerStorage.getItem('userid') + '/playlists', {
        access_token: deezerStorage.getItem('accessToken'),
        title: name
    }, {headers: {'content-type': 'application/x-www-form-urlencoded'}});
}


/**
 * Return the tracks of a playlist
 * @param {*} playlist_id 
 * @remarks This function doesn't require authentication
 * @returns {Array} tracks 
 */
plugin.pluginCallbacks.get_playlist_tracks = (playlist_id) => {
    return deezer_client.api.get_playlist_tracks(playlist_id);
};

/**
 * Add a track to a playlist
 * @param {*} playlist_id
 * @param {*} track_id 
 * @remarks This function require authentication
 * @returns {Promise} request 
 */
plugin.pluginCallbacks.add_playlist_tracks = (playlist_id, tracks_id) => {
    if(!isLogged()) { console.log("You're not logged to " + this.pluginConfig.cool_name); return false; }
    return axios.post('https://api.deezer.com/playlist/' + playlist_id + '/tracks', {
        access_token: deezerStorage.getItem('accessToken'),
        songs: tracks_id.join(',')
    }, {headers: {'content-type': 'application/x-www-form-urlencoded'}})
}


/**
 * Remove a track from a playlist
 * @param {*} playlist_id
 * @param {*} track_id 
 * @remarks This function require authentication
 * @returns {Boolean} success 
 */
plugin.pluginCallbacks.remove_playlist_tracks = (playlist_id, tracks_id) => {
    if(!isLogged()) { console.log("You're not logged to " + this.pluginConfig.cool_name); return false; }
    return axios.delete('https://api.deezer.com/playlist/' + playlist_id + '/tracks?songs=' + tracks_id.join('%2C') + "&access_token=" + deezerStorage.getItem('accessToken'));
};



plugin.pluginCallbacks.handle_oauth2 = function(app) {  
    // Redirect the user to Deezer for authentication.  When complete,
    // Deezer will redirect the user back to the application at
    //     /auth/deezer/callback
    app.get('/auth/deezer', passport.authenticate('deezer'));
    app.get('/auth/deezer/logout', function(req, res){
        req.logout(function(err) {
            if (err) { return next(err); }
            res.redirect('/');
            isLogged = false;
        });
    });
    
    // Deezer will redirect the user to this URL after approval.  Finish the
    // authentication process by attempting to obtain an access token.  If
    // access was granted, the user will be logged in.  Otherwise,
    // authentication has failed.
    app.get('/auth/deezer/callback',
    passport.authenticate('deezer', {
        successRedirect: '/',
        failureRedirect: '/'
    })
    );
    express_app = app;
};

plugin.metadata.isLogged = () => isLogged();
module.exports = plugin;