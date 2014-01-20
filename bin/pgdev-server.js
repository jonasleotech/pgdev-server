#! /usr/bin/env node

var ch = require('chokidar'),
    fs = require('fs-extra'),
    http = require('http'),
    url = require('url'),
    path = require('path'),
    portfinder = require('portfinder')


var config = fs.readJSONSync("pgdevserver.json")

var platforms = config.platforms || {
    "ios": {
        paths: [ "merges/ios", "www"],
        publish: "platforms/ios/www",
        userAgent: ".*iPhone.*"
    },
    "android": {
        paths: ["merges/android", "www"],
        publish: "platforms/android/assets/www",
        userAgent: ".*Android.*"
    },
    "www": {
        paths: ["merges/www", "www"],
        publish: "platforms/www",
        userAgent: ".*"
    },
}

function copyFile(from, to) {
    var retry = 10
    while (true)
        try {
            fs.copySync(from, to)
            break;
        } catch (e) {
            if (retry-- == 0) {
                console.error(e)
                break
            }
        }
}

function copyToPlatform(platform, file) {
    var pf = platforms[platform]
    var srcpath = null
    if( !fs.existsSync(pf.publish) ) return;
    for (var i = 0; i < pf.paths.length; i++) {
        var p = path.join(pf.paths[i], file)
        if (fs.existsSync(p)) {
            srcpath = p
            break
        }
    }
    var dstpath = path.join(pf.publish, file)
    var dirpart = path.dirname(dstpath)
    fs.mkdirsSync(dirpart)
    if (srcpath == null) {
        if (fs.existsSync(dstpath))
            fs.deleteSync(dstpath)
    } else {
        console.log(dstpath)
        copyFile(srcpath, dstpath)
    }
}

var w = ch.watch(['merges', 'www'], {ignored: /[\/\\]\./, persistent: true, ignoreInitial: false})

var paths = {}
for (var k in platforms) {
    platforms[k].paths.forEach(function (d) {
        paths[d] = 1
    })
}
w.on('all', function (event, path) {
        if (event == "add" || event == "change" || event == "delete")
            for (var k in paths) {
                var i = path.indexOf(k)
                if (i == 0) {
                    path = path.substr(k.length + 1)
                    for (var pf in platforms) {
                        copyToPlatform(pf, path)
                    }
                    break
                }
            }
    }
)


var mimeTypes = config.mimeTypes || {
    ".html": "text/html",
    "": "text/plain",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".js": "text/javascript",
    ".css": "text/css"}


var server = http.createServer(function (req, res) {
    var uri = url.parse(req.url).pathname
    var filename = path.join(process.cwd(), unescape(uri));
    var stats;
    var i = 0
    var publishDir = path.join("platforms", "www")
    var userAgent = req.headers["user-agent"]
    for (var k in platforms) {
        if (new RegExp(platforms[k].userAgent).exec(userAgent)) {
            publishDir = platforms[k].publish
            break;
        }
    }

    try {
        filename = path.join(process.cwd(), publishDir, unescape(uri))
        stats = fs.lstatSync(filename)

        if (stats.isFile()) {
            var mimeType = mimeTypes[path.extname(filename)] || mimeTypes["*"]
            res.writeHead(200, {'Content-Type': mimeType})
            var fileStream = fs.createReadStream(filename)
            fileStream.pipe(res)
        } else if (stats.isDirectory()) {
            res.writeHead(200, {'Content-Type': 'text/plain'})
            res.write('Index of ' + uri + '\n')
            res.end()
        } else {
            res.writeHead(500, {'Content-Type': 'text/plain'})
            res.write('500 Internal server error\n')
            res.end()
        }
    } catch (e) {
        res.writeHead(404, {'Content-Type': 'text/plain'})
        res.write('404 Not Found\n')
        res.end()
    }


})

portfinder.basePort = config.port || 8080;
portfinder.getPort(function (err, port) {
    if (err) throw err;
    console.log("Listening on port: " + port)
    server.listen(port)
})


