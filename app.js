const dotenv = require('dotenv');
dotenv.config();

const Plugger = require("pluggers").default;
const fs = require('fs');
const { get } = require("http");
const express = require('express')
const app = express()
const port = process.env.PORT||3000
const passport = require('passport');
const util = require('util')
const morgan = require('morgan')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const methodOverride = require('method-override')
const session = require('express-session')
const expressLayouts = require('express-ejs-layouts')


// Configure express
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(expressLayouts)
app.use(morgan('combined'));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(methodOverride('X-HTTP-Method-Override'));
app.use(session({ secret: 'keyboard cat' }));

// Initialize Passport!  Also use passport.session() middleware, to support
// persistent login sessions (recommended).
app.use(passport.initialize());
app.use(passport.session());


var sync_playlists = [];
/*
    Playlists Data format:
    [{
        "name": "playlist name",
        "media_services": ["ms-spotify, "ms-deezer"], // List of media services plugins names
        "identifiers" : {
            "ms-spotify" : "playlist_id",
            "ms-deezer" : "playlist_id"
        }
        "tracks" : [
            {
                "identifiers" : {
                    "ms-spotify" : "track_id",
                    "ms-deezer" : "track_id"
                },
                "title" : "track_title",
                "artist" : "track_artist"
            }
        ]
    }]
    Just run the script once to create the file, edit sync_playlists.json to add new playlists (with tracks object empty) then run again the script. 
*/
if(!fs.existsSync("data/")) {
    fs.mkdirSync("data");
}



if(fs.existsSync("data/sync_playlists.json")) {
    sync_playlists = JSON.parse(fs.readFileSync('data/sync_playlists.json', 'utf8'));
}
else {
    console.log("Creating playlist file...");
    fs.writeFileSync("data/sync_playlists.json", JSON.stringify(sync_playlists, null, 4));
}

// Create instance
const master = new Plugger("master");

// Add plugins
master.addPlugin(require("./plugins/deezer"));
master.addPlugin(require("./plugins/spotify"));

function contains_track(id, list, service) {
    var i;
    for (const song of list) {
        if (song["identifiers"][service] == id) {
            return true;
        }
    }
    return false;
}

function handle_oauth2() {
    for(const plugin of master.getPlugins()) {
        if(plugin.pluginConfig["oauth2"]) {
            console.log("Configuring oauth2 endpoints for " + plugin.pluginConfig["cool_name"]);
            plugin.pluginCallbacks.handle_oauth2(app);
        }
    }
}

async function searchtrack_id(service, query) {
    const response = await master.getPlugin(service).pluginCallbacks.search(query);
    return response;
}


async function get_playlist_tracks(service, playlist_id) {
    const response = await master.getPlugin(service).pluginCallbacks.get_playlist_tracks(playlist_id);
    console.log(response);
    return response;
}

async function create_playlist(service, name) {
    const response = await master.getPlugin(service).pluginCallbacks.create_playlist(name);
    console.log(response);
    return response;
}

async function add_playlist_tracks(service, playlist_id, tracks_id) {
    const response = await master.getPlugin(service).pluginCallbacks.add_playlist_tracks(playlist_id, tracks_id);
    console.log(response.content);
    return response.res
}

async function remove_playlist_tracks(service, playlist_id, tracks_id) {
    const response = await master.getPlugin(service).pluginCallbacks.remove_playlist_tracks(playlist_id, tracks_id);
    if(response.data == true) {
        return true;
    }
    return false;
}

async function do_playlist_sync(playlist_key, deezer_client) {
    var playlist_obj = sync_playlists[playlist_key]
    console_debug("Syncing playlist: " + playlist_obj["name"]);
    
    var playlist_changed = false;
    var playlist_content = {};
    var playlist_musicservices = playlist_obj["media_services"];

    for (const service of playlist_obj["media_services"]) {
        console_debug("Reading playlist from " + service);
        const playlist = await getPlaylist(service, playlist_obj["identifiers"][service]);
        playlist_content[service] = playlist;
    }
    
    for(const new_playlist of playlist_content) {
        console_debug("Checking " + new_playlist + " playlist");
        
        
    }

    


    if(playlist_changed) {
        save_playlists();
    }
}

master.initAll().then(() => {
    // get_playlist_tracks("ms-deezer", 908622995);
    // create_playlist("ms-deezer", "test");
    handle_oauth2();
    // remove_playlist_tracks("ms-deezer", 11854630901, [1153141332, 1133114822]).then((res) => {
    //     console.log(res);
    // })
    // add_playlist_tracks("ms-deezer", 11854630901, [1153141332, 1133114822]).then((res) => {
    //     console.log(res);
    // })
    // master.getPlugin("ms-spotify").pluginCallbacks.handle_refreshtoken();
    // add_playlist_tracks("ms-spotify", "5Ts21qAqQtctLRZQDjk1ro", ["spotify:track:4OMJGnvZfDvsePyCwRGO7X"]).then((res) => {
    //     console.log(res);
    // });
    get_playlist_tracks("ms-spotify", "5Ts21qAqQtctLRZQDjk1ro").then((res) => {
        console.log(res);
    });
});

app.get('/', (req, res) => {
    res.send('Hello World!')
  })
  
app.listen(port, () => {
console.log(`MusiSync app listening on port ${port}`)
})
