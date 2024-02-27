const Plugger = require("pluggers").default;
const plugin = new Plugger("ms-spotify");
const SpotifyStrategy = require('passport-spotify').Strategy;
const passport = require('passport');
const axios = require('axios');

if (typeof spotifyStorage === "undefined" || spotifyStorage === null) {
    var SpotifyStorage = require('node-localstorage').LocalStorage;
    spotifyStorage = new SpotifyStorage('./data/spotify');
  }
var SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";
var SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "";



plugin.pluginConfig = {
  cool_name: "Spotify",
  name: "ms-spotify",
  oauth2: true,
  redirect_uri: "http://localhost:3000/auth/spotify/callback",
  refresh_needed: true,
  stored_keys : ['accessToken', 'refreshToken', 'expires_in', 'userid', 'username', 'loggedin']
}

for(const key of plugin.pluginConfig.stored_keys) {
    if(spotifyStorage.getItem(key) == null) {
        spotifyStorage.setItem(key, 'false');
    }
}

function isLogged() {
    return spotifyStorage.getItem('loggedin') == 'true';
}

function logout() {
    for(const key of plugin.pluginConfig.stored_keys) {
        spotifyStorage.setItem(key, 'false');
    }
}

passport.serializeUser(function(user, done) {
    done(null, user);
  });
  
passport.deserializeUser(function(obj, done) {
    done(null, obj);
});


plugin.pluginCallbacks.init = () => {
  return "Spotify plugin initialized!";
}
  
passport.use(new SpotifyStrategy({
    clientID: SPOTIFY_CLIENT_ID,
    clientSecret: SPOTIFY_CLIENT_SECRET,
    callbackURL: plugin.pluginConfig.redirect_uri,
  },
  function(accessToken, refreshToken, expires_in, profile, done) {
    // asynchronous verification, for effect...
    process.nextTick(function () {

        // To keep the example simple, the user's Deezer profile is returned to
        // represent the logged-in user.  In a typical application, you would want
        // to associate the Deezer account with a user record in your database,
        // and return that user instead.
        spotifyStorage.setItem('loggedin', 'true');
        spotifyStorage.setItem('accessToken', accessToken);
        spotifyStorage.setItem('refreshToken', refreshToken);
        spotifyStorage.setItem('expires_in', expires_in);
        spotifyStorage.setItem('userid', profile.id);
        spotifyStorage.setItem('username', profile.displayName);
        return done(null, profile);
    });
  }
));





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
    if(!isLogged()) { console.log("You're not logged to " + this.pluginConfig.cool_name); return {res: false, content: false, error: "Not logged in"}; }
    return axios.post('https://api.deezer.com/user/' + spotifyStorage.getItem('userid') + '/playlists', {
        access_token: spotifyStorage.getItem('accessToken'),
        title: name
    }, {headers: {'content-type': 'application/x-www-form-urlencoded'}});
}


/**
 * Return the tracks of a playlist
 * @param {*} playlist_id 
 * @remarks This function doesn't require authentication
 * @returns {Array} tracks 
 */
plugin.pluginCallbacks.get_playlist_tracks = async function(playlist_id) {
    if(!isLogged()) { console.log("You're not logged to " + this.pluginConfig.cool_name); return {res: false, content: false, error: "Not logged in"}; }
    try {
        var res = await axios.post('https://api.spotify.com/v1/playlists/' + playlist_id, {headers: {'Authorization': 'Bearer ' + spotifyStorage.getItem("accessToken"), 'Content-Type': 'application/json'}});
        return {res: true, content: res.data, error: false};
    }
    catch(e) {
        console.log(e.response.data);
        if(e.response.status == 401) {
            if(await plugin.pluginCallbacks.handle_refreshtoken()) {
                return plugin.pluginCallbacks.get_playlist_tracks(playlist_id);
            }
            else {
                return {res: false, content: false, error: "Unauthorized"};
            }
        }
        else {
            return {res: false, content: false, error: e.response.data.error};
        }
    }
}

/**
 * Add a track to a playlist
 * @param {*} playlist_id
 * @param {*} track_id 
 * @remarks This function require authentication
 * @returns {Promise} request 
 */
plugin.pluginCallbacks.add_playlist_tracks = async function (playlist_id, tracks_id) {
    if(!isLogged()) { console.log("You're not logged to " + this.pluginConfig.cool_name); return {res: false, content: false, error: "Not logged in"}; }
    try {
        var res = await axios.post('https://api.spotify.com/v1/playlists/' + playlist_id + '/tracks', {
            uris: tracks_id
        }, {headers: {'Authorization': 'Bearer ' + spotifyStorage.getItem("accessToken"), 'Content-Type': 'application/json'}});
        return {res: true, content: res.data, error: false};
    }
    catch(e) {
        if(e.response.status == 401) {
            if(await plugin.pluginCallbacks.handle_refreshtoken()) {
                return plugin.pluginCallbacks.add_playlist_tracks(playlist_id, tracks_id);
            }
            else {
                return {res: false, content: false, error: "Unauthorized"};
            }
        }
        else {
            return {res: false, content: false, error: e.response.data.error};
        }
    }
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
    
}

plugin.pluginCallbacks.logout = () => logout();

plugin.pluginCallbacks.handle_refreshtoken = async function() {
    var res = await axios.post('https://accounts.spotify.com/api/token', {
        grant_type: 'refresh_token',
        refresh_token: spotifyStorage.getItem('refreshToken')
    }, {headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
    }});
    spotifyStorage.setItem('accessToken', res.data.access_token);
    spotifyStorage.setItem('expires_in', res.data.expires_in);
    console.log(spotifyStorage.getItem('accessToken'));
    return true;
}

plugin.pluginCallbacks.handle_oauth2 = function(app) {  
    // Redirect the user to Deezer for authentication.  When complete,
    // Deezer will redirect the user back to the application at
    //     /auth/deezer/callback
    app.get('/auth/spotify', passport.authenticate('spotify', { scope: ['user-read-email', 'user-read-private', 'playlist-modify-private', 'playlist-modify-public', 'playlist-read-private'] }));
    app.get('/auth/spotify/logout', function(req, res){
        req.logout(function(err) {
            if (err) { return next(err); }
            res.redirect('/');
            logout();
        });
    });
    
    // Deezer will redirect the user to this URL after approval.  Finish the
    // authentication process by attempting to obtain an access token.  If
    // access was granted, the user will be logged in.  Otherwise,
    // authentication has failed.
    app.get('/auth/spotify/callback',
        passport.authenticate('spotify', {
            successRedirect: '/',
            failureRedirect: '/'
        })
    );
};

plugin.metadata.isLogged = () => isLogged();
module.exports = plugin;