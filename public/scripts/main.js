const urlParams = new URLSearchParams(window.location.search);
var witnessOn = urlParams.get('witnessOn') ?? false;
var reloadOnMove = urlParams.get('reloadOnMove') ?? false;
let hotspots = L.layerGroup();
let forecasts = L.layerGroup();
let witnesses = L.layerGroup();

document.addEventListener('DOMContentLoaded', function () {
    var db = firebase.database();
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
    forecasts.addTo(mymap);
    witnesses.addTo(mymap);

    if (reloadOnMove) {
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
            if (response && response.data && response.data.data) {
                var data = response.data.data;
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
        hotspots.addLayer(circleSmall);
        circleSmall.bindTooltip(x.name);
        circleSmall.on('mouseup', function () {
            getWitnesses(x, drawWitnesses);
        });
    });
}

function getWitnesses(basespot, callback) {
    axios.get(`https://api.helium.io/v1/hotspots/${basespot.address}/witnesses`)
        .then(function (response) {
            if (response && response.data && response.data.data) {
                var data = response.data.data;
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
            }
        }, {
            stateName: 'witness-off',
            icon: 'fa-eye-slash',
            title: 'Hide all witnesses',
            onClick: function (btn, map) {
                witnessOn = false;
                witnesses.clearLayers();
                btn.state('witness-on');
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
                btn.state('light-off');
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
                btn.state('light-on');
            }
        }]
    });
    stateChangingButton.addTo(map);
}