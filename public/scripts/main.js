const urlParams = new URLSearchParams(window.location.search);
var witnessOn = urlParams.get('witnessOn') ?? false;
var reloadOnMove = urlParams.get('reloadOnMove') ?? false;
let hotspots = L.layerGroup();
let selected = L.layerGroup();
let forecasts = L.layerGroup();
let witnesses = L.layerGroup();
let price = 15; // USD

document.addEventListener('DOMContentLoaded', function () {
    var db = firebase?.database();
    if (location.hostname === "localhost") {
        db.useEmulator("localhost", 9000);
        console.log("localhost detected");
    } else {
        firebase.analytics();
        firebase.analytics().logEvent('load_completed');
    }
    try {
        let app = firebase.app();
        let features = [
            'auth',
            'database',
            'firestore',
            'functions',
            'messaging',
            'storage',
            'analytics',
            'remoteConfig',
            'performance',
        ].filter(feature => typeof app[feature] === 'function');
        console.info(`Firebase SDK loaded with ${features.join(', ')}`);
    } catch (e) {
        console.error(e);
        console.warn('Error loading the Firebase SDK, check the console.');
    }

    getPrice(data => price = (data?.price ?? 15 * 100000000) / 100000000);

    var mymap = L.map('mapid', {
        fullscreenControl: {
            pseudoFullscreen: false
        }
    }).setView([35.1, 33.4], 10);

    drawButtons(mymap);

    L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/dark-v10/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoiZXJpYy1oZWxpdW0iLCJhIjoiY2tvNnp4ZnhuMXI2MjJvczVhODFiNG9wZCJ9.lbv1OPPLn1gUY9Lk1owA0Q', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 18,
        id: 'mapbox/dark-v10',
        tileSize: 512,
        zoomOffset: -1,
        accessToken: 'pk.eyJ1IjoiZXJpYy1oZWxpdW0iLCJhIjoiY2tvNnp4ZnhuMXI2MjJvczVhODFiNG9wZCJ9.lbv1OPPLn1gUY9Lk1owA0Q'
    }).addTo(mymap);

    hotspots.addTo(mymap);
    selected.addTo(mymap);
    forecasts.addTo(mymap);
    witnesses.addTo(mymap);

    if (reloadOnMove) {
        firebase.analytics().logEvent('reloadOnMove');
        mymap.on('moveend', function (ev) {
            const box = getMapBox(mymap);
            getHeliumAPIData(box);
        });
    };

    getHeliumAPIData();

    var spotsRef = db.ref('spots');
    spotsRef.on('value', (snapshot) => {
        var spots = snapshot.val();
        drawForecasts(spots);
    });
});

function getPrice(callback) {
    axios.get(`https://api.helium.io/v1/oracle/prices/current`)
        .then(function (response) {
            if (response && response?.data && response?.data?.data) {
                var data = response?.data?.data;
                callback(data);
            }
        })
        .catch(function (error) {
            console.log(error);
        });
}

function getMapBox(mymap) {
    const sw = mymap.getBounds().getSouthWest();
    const ne = mymap.getBounds().getNorthEast();
    const box = {
        swlat: sw.lat,
        swlon: sw.lng,
        nelat: ne.lat,
        nelon: ne.lng
    };
    return box;
}

function getHeliumAPIData(box) {
    if (!box) {
        box = {
            swlat: 34.357042,
            swlon: 31.854858,
            nelat: 35.811131,
            nelon: 34.925537
        };
    }
    axios.get(`https://api.helium.io/v1/hotspots/location/box?swlat=${box.swlat}&swlon=${box.swlon}&nelat=${box.nelat}&nelon=${box.nelon}`)
        .then(function (response) {
            if (response && response?.data && response?.data?.data) {
                var data = response?.data?.data;
                drawHotspots(data);
                if (witnessOn) {
                    witnesses.clearLayers();
                    _.each(data, function (x) {
                        getWitnesses(x, drawWitnesses);
                    });
                }
            }
        })
        .catch(function (error) {
            console.log(error);
        });
}

function drawHotspots(data) {
    hotspots.clearLayers();
    _.each(data, function (x) {
        var c = randomColor({
            seed: x.owner,
            luminosity: 'dark',
            format: 'rgba',
            alpha: 0.5
        });
        var circleLarge = L.circle([x.lat, x.lng], {
            stroke: false,
            fillColor: c,
            fillOpacity: 0.1,
            radius: x.status.height / 300 ?? 2800,
            interactive: false
        });
        hotspots.addLayer(circleLarge);
        var circleSmall = L.circle([x.lat, x.lng], {
            stroke: x.status.online == "online",
            color: c,
            fillColor: c,
            fillOpacity: 0.5,
            radius: 300
        });
        var circleSmallSelected = L.circle([x.lat, x.lng], {
            stroke: x.status.online == "online",
            color: '#fff',
            fillColor: c,
            fillOpacity: 1,
            radius: 333
        });
        hotspots.addLayer(circleSmall);
        circleSmall.bindTooltip(x.name);
        circleSmall.on('mouseup', function () {
            firebase.analytics().logEvent('circleSmall_mouseup');
            selected.clearLayers();
            selected.addLayer(circleSmallSelected);
            clearDataShow();
            witnesses.clearLayers();
            hotspotDataShow(x);
            getWitnesses(x, witnessDataShow);
            getRewards(x, 1, rewardsDataShow);
        });
    });
}

function getWitnesses(basespot, callback) {
    axios.get(`https://api.helium.io/v1/hotspots/${basespot.address}/witnesses`)
        .then(function (response) {
            if (response && response?.data && response?.data?.data) {
                var data = response?.data?.data;
                callback(data, basespot);
            }
        })
        .catch(function (error) {
            console.log(error);
        });
}

function drawWitnesses(data, basespot) {
    var cc = randomColor({
        seed: basespot.owner,
        luminosity: 'dark',
        format: 'rgba',
        alpha: 0.25
    });
    _.each(data, function (d) {
        const baseLatLng = L.latLng(basespot.lat, basespot.lng);
        const targetLatLng = L.latLng(d.lat, d.lng);
        var polyline = L.polyline([baseLatLng, targetLatLng], { color: cc });
        witnesses.addLayer(polyline);
        polyline.bindTooltip(`${Math.round(baseLatLng.distanceTo(targetLatLng)) / 1000}km`);
    });
}

function clearDataShow() {
    document.getElementById('txtLeft').innerHTML = "";
    document.getElementById('txtRight').innerHTML = "";
}

function hotspotDataShow(spot) {
    document.getElementById('txtLeft').innerHTML = `<b>Name:</b> ${spot.name}
    <br />
    <b>Owner:</b> ${spot.owner}
    <br />
    <b>Lat:</b> ${spot.lat}, <b>Long:</b> ${spot.lng}
    <br />
    <b>Elevation:</b> ${spot.elevation}, <b>Gain:</b> ${spot.gain}, <b>Reward Scale:</b> ${spot.reward_scale}
    <br />
    <b>Mode:</b> ${spot.mode}, <b>Status:</b> ${spot.status.online}
    <br />
    <b>Date added:</b> ${spot.timestamp_added}`;
    document.getElementById('bar').classList.remove('d-none');
}

function witnessDataShow(data, spot) {
    document.getElementById('txtRight').innerHTML = `${document.getElementById('txtRight').innerHTML}
    <b>Witnesses:</b> ${data.length}
    <br />`;
    document.getElementById('bar').classList.remove('d-none');
    drawWitnesses(data, spot);
}

function getRewards(basespot, days, callback) {
    const start = new Date(new Date().setUTCDate(new Date().getUTCDate() - days));
    const end = new Date();
    axios.get(`https://api.helium.io/v1/hotspots/${basespot.address}/rewards/sum?min_time=${start.toISOString()}&max_time=${end.toISOString()}`)
        .then(function (response) {
            if (response && response?.data && response?.data?.data) {
                var data = response?.data?.data;
                callback(basespot, data, days);
            }
        })
        .catch(function (error) {
            console.log(error);
        });
}

function rewardsDataShow(basespot, data, days) {
    document.getElementById('txtRight').innerHTML = `${document.getElementById('txtRight').innerHTML}
    <b>In the last:</b> ${days} ${days == 1 ? 'day' : 'days'}
    <br />
    <b>Rewards:</b> ${new Intl.NumberFormat().format(data.total)} HNT, ${new Intl.NumberFormat().format(data.total * price)} USD
    <br />`;
    document.getElementById('bar').classList.remove('d-none');
    if (days == 1) {
        getRewards(basespot, 30, rewardsDataShow);
    }
}

function drawForecasts(spots) {
    _.each(spots, function (x) {
        var c = randomColor({
            seed: x.name,
            luminosity: 'light',
            format: 'rgba',
            alpha: 0.5
        });
        var circleSmall = L.circle([x.lat, x.lng], {
            stroke: false,
            fillColor: c,
            fillOpacity: 0.5,
            radius: 300
        });
        forecasts.addLayer(circleSmall);
        circleSmall.bindTooltip(x.name);
    });
}

function drawButtons(map) {
    addToggleWitnesses(map);
    addToggleTheme(map);
    addWikiLink(map);
    addGitHubLink(map);
}

function addToggleWitnesses(map) {
    var stateChangingButton = L.easyButton({
        states: [{
            stateName: 'witness-on',
            icon: 'fa-eye',
            title: 'Show all witnesses',
            onClick: function (btn, map) {
                witnessOn = true;
                const box = getMapBox(map);
                getHeliumAPIData(box);
                map.flyTo(map.getCenter(), map.getZoom() - 0.1, {
                    animate: true,
                    duration: 0.5,
                });
                btn.state('witness-off');
                firebase.analytics().logEvent('btn_witness-off');
            }
        }, {
            stateName: 'witness-off',
            icon: 'fa-eye-slash',
            title: 'Hide all witnesses',
            onClick: function (btn, map) {
                witnessOn = false;
                witnesses.clearLayers();
                btn.state('witness-on');
                firebase.analytics().logEvent('btn_witness-on');
            }
        }]
    });
    stateChangingButton.addTo(map);
}

function addToggleTheme(map) {
    var stateChangingButton = L.easyButton({
        states: [{
            stateName: 'light-on',
            icon: 'fa-map-o',
            title: 'Light theme',
            onClick: function (btn, map) {
                L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/light-v10/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoiZXJpYy1oZWxpdW0iLCJhIjoiY2tvNnp4ZnhuMXI2MjJvczVhODFiNG9wZCJ9.lbv1OPPLn1gUY9Lk1owA0Q', {
                    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
                    maxZoom: 18,
                    id: 'mapbox/light-v10',
                    tileSize: 512,
                    zoomOffset: -1,
                    accessToken: 'pk.eyJ1IjoiZXJpYy1oZWxpdW0iLCJhIjoiY2tvNnp4ZnhuMXI2MjJvczVhODFiNG9wZCJ9.lbv1OPPLn1gUY9Lk1owA0Q'
                }).addTo(map);
                document.querySelectorAll(".text-primary").forEach(txt => {
                    txt.classList.toggle('text-primary');
                    txt.classList.toggle('text-secondary');
                });
                btn.state('light-off');
                firebase.analytics().logEvent('btn_light-off');
            }
        }, {
            stateName: 'light-off',
            icon: 'fa-map',
            title: 'Dark theme',
            onClick: function (btn, map) {
                L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/dark-v10/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoiZXJpYy1oZWxpdW0iLCJhIjoiY2tvNnp4ZnhuMXI2MjJvczVhODFiNG9wZCJ9.lbv1OPPLn1gUY9Lk1owA0Q', {
                    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
                    maxZoom: 18,
                    id: 'mapbox/dark-v10',
                    tileSize: 512,
                    zoomOffset: -1,
                    accessToken: 'pk.eyJ1IjoiZXJpYy1oZWxpdW0iLCJhIjoiY2tvNnp4ZnhuMXI2MjJvczVhODFiNG9wZCJ9.lbv1OPPLn1gUY9Lk1owA0Q'
                }).addTo(map);
                document.querySelectorAll(".text-secondary").forEach(txt => {
                    txt.classList.toggle('text-primary');
                    txt.classList.toggle('text-secondary');
                });
                btn.state('light-on');
                firebase.analytics().logEvent('btn_light-on');
            }
        }]
    });
    stateChangingButton.addTo(map);
}

function addWikiLink(map) {
    L.easyButton('fa-wikipedia-w', function (btn, map) {
        window.open('https://github.com/eric-iq2/heliumcomcy/wiki', '_blank');
        firebase.analytics().logEvent('btn_addWikiLink');
    }).addTo(map);
}

function addGitHubLink(map) {
    L.easyButton('fa-github', function (btn, map) {
        window.open('https://github.com/eric-iq2/heliumcomcy', '_blank');
        firebase.analytics().logEvent('btn_addGitHubLink');
    }).addTo(map);
}