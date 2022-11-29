"use strict";

var commandLineArgs  = require('command-line-args'),
    fs               = require('fs'),
    WebHooks         = require('node-webhooks'),
    imgur            = require('imgur-node-api'),
    RoonApi          = require("node-roon-api"),
    RoonApiSettings  = require('node-roon-api-settings'),
    RoonApiStatus    = require('node-roon-api-status'),
    RoonApiTransport = require('node-roon-api-transport'),
    RoonApiImage     = require('node-roon-api-image');

var core = undefined;
var transport = undefined;
var zones = [];
var trigger = undefined;
var image = undefined;
var message = undefined;

const optionDefinitions = [
    { name: 'webhook', type: String },
    { name: 'imgurid', type: String },
    { name: 'zone', type: String }
];

var args = commandLineArgs(optionDefinitions);

var roon = new RoonApi({
    extension_id:        'com.rhodium.roonbot',
    display_name:        "RoonBot for Slack",
    display_version:     "1.0.0",
    publisher:           'Thomas Rosdahl',
    email:               'thomas.rosdahl@telia.com',
	core_paired: function(core_) {
        core = core_;
        image = core.services.RoonApiImage;
        transport = core.services.RoonApiTransport;
        transport.subscribe_zones((response, msg) => {
            if (response == "Subscribed") {
                zones = msg.zones;
            } else if (response == "Changed") {
                if (msg.zones_changed) {
                    zones = msg.zones_changed;
                }
                if (msg.zones_added) {
                    zones = msg.zones_added;
                }
            }
        });
    },
    core_unpaired: function(core_) {
        core = undefined;
        transport = undefined;
    }
});

var webHooks = new WebHooks({
    db: './webHooksDB.json',
    httpSuccessCodes: [200, 201, 202, 203, 204], })

var emitter = webHooks.getEmitter()
  
emitter.on('*.success', function (shortname, statusCode, body) {
    console.log('Success on trigger webHook ' + shortname + ' with status code', statusCode, 'and body', body)
})
 
emitter.on('*.failure', function (shortname, statusCode, body) {
    console.error('Error on trigger webHook ' + shortname + ' with status code', statusCode, 'and body', body)
})

webHooks.add('slack', args.webhook);

roon.init_services({
    required_services: [ RoonApiTransport, RoonApiImage ]
});

imgur.setClientID(args.imgurid);

roon.start_discovery();

monitor();

function monitor() {
    for (var i = 0; i < zones.length; i++) {
        if (zones[i].display_name.toUpperCase() == args.zone.toUpperCase() && 
            zones[i].now_playing != undefined) {
            var now_playing = zones[i].now_playing;
            if (trigger != now_playing.three_line.line3) {
                trigger = now_playing.three_line.line3;
                console.log('New trigger: ' + trigger);
                var options = { scale: 'fit', width: 200, height: 200 };
                console.log('Downloading image key=' + now_playing.image_key);
                if (now_playing.image_key != undefined) {
                    image.get_image(now_playing.image_key, options, function (error, content_type, image)
                    {
                        if (error == true) { console.log('Error:' + error);  return; }
                        fs.writeFile('image.tmp', image, function (err) {
                            console.log('Uploading image');
                            imgur.upload('image.tmp', function (err, res) {
                                if (err != undefined) { console.log(err); return; }
                                if (res != undefined) {
                                    console.log('Triggering webhook')
                                    webHooks.trigger('slack', {attachments: [
                                        {
                                            "fallback": trigger,
                                            "color": "#CCCCCC",
                                            "title": trigger,
                                            "title_link": 'https://www.google.com/search?q=' + encodeURIComponent(now_playing.three_line.line2 + ' ' + now_playing.three_line.line3),
                                            "image_url": res.data.link,
                                            "fields": [
                                                {
                                                    "title": "Track",
                                                    "value": now_playing.three_line.line1,
                                                    "short": true
                                                },
                                                {
                                                    "title": "Artist",
                                                    "value": now_playing.three_line.line2,
                                                    "short": true
                                                }
                                            ]
                                        }
                                    ]})
                                }
                            });
                        });
                    });
                } else {
                    console.log('Triggering webhook')
                    webHooks.trigger('slack', {attachments: [
                        {
                            "fallback": trigger,
                            "color": "#CCCCCC",
                            "title": trigger,
                            "title_link": 'https://www.google.com/search?q=' + encodeURIComponent(now_playing.three_line.line2 + ' ' + now_playing.three_line.line3),
                            "image_url": 'https://i.imgur.com/R2lfJDL.jpg',
                            "fields": [
                                {
                                    "title": "Track",
                                    "value": now_playing.three_line.line1,
                                    "short": true
                                },
                                {
                                    "title": "Artist",
                                    "value": now_playing.three_line.line2,
                                    "short": true
                                }
                            ]
                        }
                    ]})
                }
            }
        }
    }
    setTimeout(monitor, 10000);
}
