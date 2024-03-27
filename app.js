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
        "media_services": ["spotify", "deezer"],
        "identifiers" : {
            "spotify" : "playlist_id",
            "deezer" : "playlist_id"
        },
        "tracks" : [
            {
                "identifiers" : {
                    "spotify" : "track_id",
                    "deezer" : "track_id"
                },
                "name" : "track_title",
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

function save_playlists() {
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
        if(song["identifiers"] == undefined) continue;
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



async function search_track(service, query) {
    const response = await master.getPlugin(service).pluginCallbacks.search_track(query);
    return response;
}


async function get_playlist_tracks(service, playlist_id) {
    const response = await master.getPlugin(service).pluginCallbacks.get_playlist_tracks(playlist_id);
    return response;
}

async function create_playlist(service, name) {
    const response = await master.getPlugin(service).pluginCallbacks.create_playlist(name);
    return response;
}

async function add_playlist_tracks(service, playlist_id, tracks_id) {
    const response = await master.getPlugin(service).pluginCallbacks.add_playlist_tracks(playlist_id, tracks_id);
    return response;
}

async function remove_playlist_tracks(service, playlist_id, tracks_id) {
    const response = await master.getPlugin(service).pluginCallbacks.remove_playlist_tracks(playlist_id, tracks_id);
    return response;
}

async function do_playlist_sync(playlist_key) {
    const playlist = sync_playlists[playlist_key];
    console.log("Syncing playlist: " + playlist["name"]);
    let playlist_changed = false;
    let new_tracks = {};
    let old_tracks = [];

    for (const service of playlist["media_services"]) {
        console.log("Reading playlist from " + service);
        const playlist_tracks = await get_playlist_tracks(service, playlist["identifiers"][service]);
        new_tracks[service] = [];
        for(const track of playlist_tracks.content) {
            if(!contains_track(track["id"], playlist["tracks"], service)) {
                new_tracks[service].push({
                    "identifiers" : {
                        [service] : track["id"]
                    },
                    "name" : track["name"],
                    "artist" : track["artist"],
                    "length" : track["length"]
                });
                playlist_changed = true;
            }
        }
        // for(const track of playlist["tracks"]) {
        //     if(!contains_track(track["identifiers"][service], playlist_tracks.content, service)) {
        //         console.log("Track not found in remote playlist, removing...");
        //         old_tracks[service].push(track["identifiers"][service]);
        //         playlist_changed = true;
        //     }
        // }
    }
    for (const origin_service in new_tracks) {
        if (new_tracks[origin_service].length == 0) continue;
        // Search for the tracks in the other service
        // var new_tracks = [];
        for (const target_service of playlist["media_services"]) {
            if(origin_service == target_service) continue;
            var tracks_toadd = [];
            for(let i = 0; i < new_tracks[origin_service].length; i++) {
                let track = new_tracks[origin_service][i];
                const search_result = await search_track(target_service, track["name"] + " " + track["artist"]);
                if(search_result.content.length > 0) {
                    let found = false;
                    for(const searchtrack of search_result.content) {
                        if(Math.abs(searchtrack["length"] - track["length"]) < 2) {
                            tracks_toadd.push(searchtrack["id"]);
                            track["identifiers"][target_service] = searchtrack["id"]; 
                            found = true;
                            console.log("Track found in " + target_service + " : " + track["name"] + " " + track["artist"] + " " + track["length"] + " " + searchtrack["length"]);
                            break;
                        }
                    }
                    if(!found) {
                        console.log("Track not found in " + target_service + " searching for " + track["name"] + " " + track["artist"] + " (" + track["length"] + "s)");
                    }
                }
                else {
                    console.log("Track not found in " + target_service + " searching for " + track["name"] + " " + track["artist"] + " (" + track["length"] + "s)");
                }
                // const add_result = await add_playlist_tracks(target_service, playlist["identifiers"][target_service], tracks_id);
            }
            if(tracks_toadd.length > 0) {
                add_playlist_tracks(target_service, playlist["identifiers"][target_service], tracks_toadd).then((res) => {
                    console.log(res);
                }); 
                console.log("New tracks for " + target_service + " : " + tracks_toadd.concat(" "));
            }
        }
        sync_playlists[playlist_key]["tracks"] = sync_playlists[playlist_key]["tracks"].concat(new_tracks[origin_service]);
    }
    save_playlists();
    
}

async function musisync() {
    await do_playlist_sync(0);
}
master.initAll().then(() => {
    // get_playlist_tracks("deezer", 908622995);
    handle_oauth2();
    // create_playlist("deezer", "test").then((res) => {
    //     console.log(res);
    
    // });
    // remove_playlist_tracks("deezer", 11854630901, [1153141332, 1133114822]).then((res) => {
    //     console.log(res);
    // })
    // add_playlist_tracks("deezer", 11854630901, [1153141332, 1133114822]).then((res) => {
    //     console.log(res);
    // })
    // add_playlist_tracks("spotify", "5Ts21qAqQtctLRZQDjk1ro", ["spotify:track:4OMJGnvZfDvsePyCwRGO7X"]).then((res) => {
    //     console.log(res);
    // });
    // get_playlist_tracks("spotify", "5Ts21qAqQtctLRZQDjk1ro").then((res) => {
    //     console.log(res.content);
    // });
    // create_playlist("spotify", "test").then((res) => {
    //     console.log(res);
    // });
    // search_track("spotify", "Back to the Start Michael Schulte").then((res) => {
    //     console.log(res);
    // });
    // search_track("deezer", "Back to the Start Michael Schulte").then((res) => {
    //     console.log(res);
    // });
    musisync();
});

app.get('/', (req, res) => {
    res.send('Hello World!')
  })
  
app.listen(port, () => {
console.log(`MusiSync app listening on port ${port}`)
})
