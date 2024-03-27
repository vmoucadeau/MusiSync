const Plugger = require("pluggers").default;
const plugin = new Plugger("deezer");
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
    name: "deezer",
    oauth2: true,
    redirect_uri: "http://localhost:3000/auth/deezer/callback",
    refresh_needed: true,
    stored_keys : ['accessToken', 'userid', 'username', 'loggedin']
}

for(const key of plugin.pluginConfig.stored_keys) {
    if(deezerStorage.getItem(key) == null) {
        deezerStorage.setItem(key, 'false');
    }
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


function is_in_playlist(playlist_content, track_id) {
    for(const track of playlist_content) {
        if(track.id == track_id) {
            return true;
        }
    }
    return false;
}


plugin.pluginCallbacks.search_track = async function(query) {
    const response = await fetch(`https://api.deezer.com/search?q=${query}`);
    try {
        const resp_json = await response.json();
        return {res: true, content: resp_json.data.map((obj) => {
            return {
                id: obj.id,
                name: obj.title,
                artist: obj.artist.name,
                length: obj.duration
            }
        }), error: false};
    }
    catch(err) {
        return {res: false, content: false, error: err};
    }
}

/**
 * Create a playlist and return the playlist id
 * @param {name} name name of the playlist
 */
plugin.pluginCallbacks.create_playlist = async function (name) {
    if(!isLogged()) { console.log("You're not logged to " + plugin.pluginConfig.cool_name); return false; }
    try {
        var response = await axios.post('https://api.deezer.com/user/' + deezerStorage.getItem('userid') + '/playlists', {
            access_token: deezerStorage.getItem('accessToken'),
            title: name
        }, {headers: {'content-type': 'application/x-www-form-urlencoded'}});
        return {res: true, content: response.data, error: false};
    }
    catch(err) {
        return {res: false, content: false, error: err};
    }
}


/**
 * Return the tracks of a playlist
 * @param {*} playlist_id 
 * @remarks This function doesn't require authentication
 * @returns {Array} tracks 
 */
plugin.pluginCallbacks.get_playlist_tracks = async function (playlist_id) {
    var response = await deezer_client.api.get_playlist_tracks(playlist_id);
    return {res: true, content: response.data.map((obj) => {
        return {
            id: obj.id,
            name: obj.title,
            artist: obj.artist.name,
            length: obj.duration
        }
    }), error: false};
};

/**
 * Add a track to a playlist
 * @param {*} playlist_id
 * @param {*} track_id 
 * @remarks This function require authentication
 * @returns {Promise} request 
 */
plugin.pluginCallbacks.add_playlist_tracks = async function(playlist_id, tracks_id) {
    if(!isLogged()) { console.log("You're not logged to " + plugin.pluginConfig.cool_name); return false; }
    try {
        // remove duplicates
        var playlist_tracks = await plugin.pluginCallbacks.get_playlist_tracks(playlist_id);
        var tracks_id = tracks_id.filter((track_id) => !is_in_playlist(playlist_tracks.content, track_id));

        var response = await axios.post('https://api.deezer.com/playlist/' + playlist_id + '/tracks', {
            access_token: deezerStorage.getItem('accessToken'),
            songs: tracks_id.join(',')
        }, {headers: {'content-type': 'application/x-www-form-urlencoded'}});
        if(response.data.error != null) {
            return {res: false, content: false, error: response.data.error};
        }
        return {res: true, content: response.data, error: false};
    }
    catch(err) {
        return {res: false, content: false, error: err};
    }
}


/**
 * Remove a track from a playlist
 * @param {*} playlist_id
 * @param {*} track_id 
 * @remarks This function require authentication
 * @returns {Boolean} success 
 */
plugin.pluginCallbacks.remove_playlist_tracks = async function(playlist_id, tracks_id) {
    if(!isLogged()) { console.log("You're not logged to " + plugin.pluginConfig.cool_name); return false; }
    try {
        var response = await axios.delete('https://api.deezer.com/playlist/' + playlist_id + '/tracks?songs=' + tracks_id.join('%2C') + "&access_token=" + deezerStorage.getItem('accessToken'));
        if(response.data.error != null) {
            return {res: false, content: false, error: response.data.error};
        }
        return {res: true, content: response.data, error: false};
    }
    catch(err) {
        return {res: false, content: false, error: err};
    }
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