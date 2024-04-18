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
let syncing = false;
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

function contains_track(track, list, service) {
    if(list == undefined || list == []) return false;
    for (const song of list) {
        if(song["identifiers"] == undefined) continue;
        if (song["identifiers"][service] == track["identifiers"][service] || song["isrc"] == track["isrc"] || track["identifiers"][service] == false) { // If the track is already in the playlist or if the track is not found in the service
            return true;
        }
    }
    return false;
}

function is_track_saved(track, playlist) {
    for (const element of playlist["tracks"]) {
        if(element["isrc"] == track["isrc"]) {
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


async function search_track_by_isrc(service, isrc) {
    const response = await master.getPlugin(service).pluginCallbacks.search_track_by_isrc(isrc);
    return response;
}

async function search_track(service, track, isrc = null) {
    if(isrc != null && isrc != undefined) {
        let getbyisrc = await search_track_by_isrc(service, isrc);
        if(getbyisrc.res) {
            if(getbyisrc.content.length > 0 && getbyisrc.content[0]["id"] != undefined) {
                return {res: true, content: getbyisrc.content[0], error: false};
            }
        }
    }
    const response = await master.getPlugin(service).pluginCallbacks.search_track(track["name"], track["artist"]);
    if(response.res) {
        if(response.content.length > 0) {
            for(const searchtrack of response.content) {
                if(Math.abs(searchtrack["length"] - track["length"]) < 5) {
                    return {res: true, content: searchtrack, error: false};
                }
            }
        }
        return {res: true, content: null, error: "Track not found"};
    }
    return {res: false, content: false, error: response.error};
}


async function get_playlist_tracks(service, playlist_id) {
    const response = await master.getPlugin(service).pluginCallbacks.get_playlist_tracks(playlist_id);
    if(response.res) {
        return {res: true, content: response.content.map((item) => {
            return {
                "identifiers":{
                        [service]: item["id"]
                },
                "name": item["name"],
                "artist": item["artist"],
                "length": item["length"],
                "isrc": item["isrc"]
            }
        }), error:false};
    }
    else return {res: false, content: [], error: response.error};
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
    syncing = true;
    const playlist = sync_playlists[playlist_key];
    console.log("Syncing playlist: " + playlist["name"]);
    let playlist_changed = false;
    let new_tracks = {};
    let old_tracks = [];
    
    for (const service in playlist["identifiers"]) {
        // console.log("Reading playlist from " + service);
        const playlist_tracks = await get_playlist_tracks(service, playlist["identifiers"][service]);
        if(!playlist_tracks.res) { // Prevent destroying everything if one service is down or too many requests
            console.log(playlist_tracks.error);
            continue;
        }
        new_tracks[service] = [];
        let i = 0;
        for(const track of playlist["tracks"]) {
            if(!contains_track(track, playlist_tracks.content, service)) {
                console.log(track["name"] + " not found in " + service + " playlist, removing it");
                delete track["identifiers"][service];
                old_tracks.push(track);
                playlist["tracks"].splice(i, 1);
                playlist_changed = true;
            }
            i++;
        }
        for(const track of playlist_tracks.content) {
            if(!contains_track(track, playlist["tracks"], service) && !contains_track(track, old_tracks, service)) {
                console.log(track["name"] + " found in " + service + " playlist, adding it");
                new_tracks[service].push(track);
                playlist_changed = true;
            }
        }
        
    }
    if(playlist_changed) {
        let old_tracks_ids = {};
        for (const track of old_tracks) {
            for(const service in track["identifiers"]) {
                old_tracks_ids[service] = old_tracks_ids[service] || [];
                if(track["identifiers"][service] == false) {
                    console.log("Can't remove " + track["name"] + " from " + service + " because it was not found in the service");
                    continue;
                }
                old_tracks_ids[service].push(track["identifiers"][service]);
            }
        }
        if(old_tracks.length > 0) {
            console.log("Old tracks ids : " + JSON.stringify(old_tracks_ids));
            for (const service in old_tracks_ids) {
                if (old_tracks_ids[service].length == 0) continue;
                // const remove_req = await remove_playlist_tracks(service, playlist["identifiers"][service], old_tracks_ids[service]);
                // if(!remove_req.res) {
                //     console.log("[" + service + "] Error while removing tracks")
                //     console.log(remove_req);
                    
                // }
                // else {
                //     console.log("[" + service + "] Track remove result : " + remove_req.res);
                // }        
            }
        }

        for (const origin_service in new_tracks) {
            if (new_tracks[origin_service].length == 0) continue;
            // Search for the tracks in the other service
            // var new_tracks = [];
            for (const target_service in playlist["identifiers"]) {
                if(origin_service == target_service) continue;
                var tracks_toadd = [];
                for(let i = 0; i < new_tracks[origin_service].length; i++) {
                    let track = new_tracks[origin_service][i];
                    const search_result = await search_track(target_service, track, track["isrc"]);
                    if(!search_result.res) {
                        delete new_tracks[origin_service][i];
                        console.log("[" + target_service + "] Error while searching track, will be added next time...");
                        console.log(search_result.error);
                        continue;
                    }
                    if(search_result.content != undefined && search_result.content["id"] != undefined) {
                        console.log("Track found in " + target_service + " : " + track["name"] + " " + track["artist"] + " " + track["length"] + " " + (search_result.content["length"] || "nolength"));
                        tracks_toadd.push(search_result.content["id"]);
                        track["identifiers"][target_service] = search_result.content["id"]; 
                    }
                    else {
                        console.log("Track not found in " + target_service + " : " + track["name"] + " " + track["artist"] + " " + track["length"]);
                        track["identifiers"][target_service] = false; // Track not found in the service
                    }
                }
                if(tracks_toadd.length > 0) {
                    const addtracks_req = await add_playlist_tracks(target_service, playlist["identifiers"][target_service], tracks_toadd);
                    console.log("New tracks for " + target_service + " : " + tracks_toadd.concat(" "));
                    if(!addtracks_req.res) {
                        console.log("[" + target_service + "] Error while adding tracks")
                        console.log(addtracks_req);
                        
                    }
                    else {
                        console.log("[" + target_service + "] Track add result : " + addtracks_req.res);
                    }
                }
            }
            for(const track of new_tracks[origin_service]) {
                if(!is_track_saved(track, playlist)) {
                    playlist["tracks"].push(track);
                }
            }
        }
        save_playlists();
    }
    syncing = false;
}

async function musisync() {
    for(let i = 0; i < sync_playlists.length; i++) {
        if(syncing) break;
        await do_playlist_sync(i);
    }
    setInterval(async () => {
        if(!syncing) {
            for(let i = 0; i < sync_playlists.length; i++) {
                if(syncing) break;
                await do_playlist_sync(i);
            }
        };
    }, 10000);
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
    // search_track_by_isrc("spotify", "GBKCF2000928").then((res) => {
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
