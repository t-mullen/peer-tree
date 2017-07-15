var SimpleSignalServer = require('simple-signal-server')
var TreeModel = require('./treeModel')

function PeerTreeServer (io, opts) {
  var self = this
  if (!(self instanceof PeerTreeServer)) return new PeerTreeServer(io, opts)

  opts = opts || {}

  self._signal = SimpleSignalServer(io)
  self._models = {}
  self._socketToTree = {}
  self.k = opts.k || 4

  self._signal.on('discover', self._onDiscover.bind(self))
  self._signal.on('disconnect', self._onDisconnect.bind(self))
}

PeerTreeServer.prototype._onDiscover = function (request) {
  var self = this

  if (request.metadata.ignore) {
    request.discover({
      ignore: true
    })
    return
  }

  var id = request.initiator.id
  var treeID = request.metadata.treeID || null
  var createNew = request.metadata.createNew || null

  if (createNew) {
    self._models[id] = new TreeModel(self.k)
    self._models[id].setBroadcaster(id)
    request.discover({
      peers: [],
      treeID: id
    })
    self._socketToTree[id] = id
  } else {
    if (!self._models[treeID]) {
      request.discover({
        err: 'Tree does not exist.'
      })
    } else {
      request.discover({
        peers: self._models[treeID].addPeer(id),
        treeID: treeID
      })
    }
    self._socketToTree[id] = treeID
  }
}

PeerTreeServer.prototype._onDisconnect = function (socket) {
  var self = this

  var id = socket.id
  var treeID = self._socketToTree[id] || null

  if (self._models[treeID]) {
    self._models[treeID].removePeer(id)
  }

  delete self._socketToTree[id]
}

module.exports = PeerTreeServer
