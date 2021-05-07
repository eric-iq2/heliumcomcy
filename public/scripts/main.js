const urlParams = new URLSearchParams(window.location.search);
const witnessOn = urlParams.get('witnessOn') ?? false;

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

    L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/dark-v10/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoiZXJpYy1oZWxpdW0iLCJhIjoiY2tvNnp4ZnhuMXI2MjJvczVhODFiNG9wZCJ9.lbv1OPPLn1gUY9Lk1owA0Q', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 18,
        id: 'mapbox/dark-v10',
        tileSize: 512,
        zoomOffset: -1,
        accessToken: 'pk.eyJ1IjoiZXJpYy1oZWxpdW0iLCJhIjoiY2tvNnp4ZnhuMXI2MjJvczVhODFiNG9wZCJ9.lbv1OPPLn1gUY9Lk1owA0Q'
    }).addTo(mymap);

    axios.get('https://api.helium.io/v1/hotspots/location/box?swlat=34.357042&swlon=31.854858&nelat=35.811131&nelon=34.925537')
        .then(function (response) {
            if (response && response.data && response.data.data) {
                var data = response.data.data;
                drawHotspots(mymap, data);
                if (witnessOn) {
                    _.each(data, function (x) {
                        axios.get(`https://api.helium.io/v1/hotspots/${x.address}/witnesses`)
                            .then(function (response) {
                                if (response && response.data && response.data.data) {
                                    var data = response.data.data;
                                    drawWitnesses(mymap, data);
                                }
                            })
                            .catch(function (error) {
                                console.log(error);
                            });
                    });
                }
            }
        })
        .catch(function (error) {
            console.log(error);
        });

    var spotsRef = db.ref('spots');
    spotsRef.on('value', (snapshot) => {
        var spots = snapshot.val();
        drawForecasts(mymap, spots);
    });
});

function drawHotspots(map, data) {
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
        }).addTo(map);
        var circleSmall = L.circle([x.lat, x.lng], {
            stroke: x.status.online == "online",
            color: c,
            fillColor: c,
            fillOpacity: 0.5,
            radius: 300
        }).addTo(map);
        circleSmall.bindTooltip(x.name);
    });
}

function drawWitnesses(map, data) {
    var cc = randomColor({
        seed: x.owner,
        luminosity: 'dark',
        format: 'rgba',
        alpha: 0.25
    });
    _.each(data, function (d) {
        var latlngs = [[x.lat, x.lng], [d.lat, d.lng]];
        var polyline = L.polyline(latlngs, { color: cc }).addTo(map);
    });
}

function drawForecasts(map, spots) {
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
        }).addTo(map);
        circleSmall.bindTooltip(x.name);
    });
}