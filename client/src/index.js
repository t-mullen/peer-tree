const SimpleSignalClient = require('simple-signal-client')
const inherits = require('inherits')
const EventEmitter = require('nanobus')

inherits(PeerTreeClient, EventEmitter)

function PeerTreeClient (io, opts) {
  var self = this
  if (!(self instanceof PeerTreeClient)) return new PeerTreeClient(io, opts)

  EventEmitter.call(this)

  self.opts = opts || {}
  self.opts.timeout = self.opts.timeout || 10000

  self.destroyed = false 
  self._treeID = null
  self._inTree = false

  self._socket = io
  self._client = new SimpleSignalClient(io)

  self._upPeerIDs = [] // IDs of confirmed upstream peers
  self._upPeers = []
  self._downPeers = []

  self._client.on('discover', self._onDiscover.bind(self))
  self._client.on('request', self._onRequest.bind(self))
}

// Join an existing tree
PeerTreeClient.prototype.connect = function (treeID) {
  var self = this

  if (self._inTree) {
    self.emit('error', new Error('Already connected to a tree'))
  }
  self._inTree = true
  self._treeID = treeID

  self._client.discover({
    treeID
  })
}

PeerTreeClient.prototype.destroy = function () {
  var self = this

  this.destroyed = true
  self._client.destroy()
  self._treeID = null
}

PeerTreeClient.prototype._disconnectUpstream = function () {
  var self = this

  self._upPeers.forEach(function (peer) {
    peer.destroy()
  })

  self._upPeerIDs = []
  self._upPeers = []

  self.emit('disconnect') // disconnected from tree
}

PeerTreeClient.prototype._disconnectDownstream = function () {
  var self = this

  self._downPeers.forEach(function (peer) {
    peer.destroy()
  })
  self._downPeers = []
}

PeerTreeClient.prototype.reconnectUpstream = function () {
  var self = this

  self._disconnectUpstream()
  self.connect(self._treeID) // rejoin the tree
}

PeerTreeClient.prototype._reconnectDownstream = function () {
  var self = this

  self._disconnectDownstream()
  self.connect(self._treeID) // rejoin the tree
}

// Create a new tree
PeerTreeClient.prototype.create = function () {
  var self = this

  if (self._inTree) {
    return self.emit('error', new Error('Already connected to tree.'))
  }
  self._inTree = true

  self._client.discover({
    createNew: true
  })
}

PeerTreeClient.prototype._onDiscover = function (discoveryData) {
  var self = this

  if (discoveryData.err) {
    return self.emit('error', new Error(discoveryData.err))
  }

  discoveryData.peers.forEach(function (peerID) {
    self._upPeerIDs.push(peerID)
    self._client.connect(peerID, null, self.opts).then(({ peer, _ }) => {
      self._onPeer(peer, peerID)
    }).catch(reason => {
      self.reconnectUpstream()
    })
  })

  self.emit('discover', discoveryData.treeID) // discovered tree
}

PeerTreeClient.prototype._onRequest = function (request) {
  var self = this

  // All incoming requests are downstream, so no issue accepting them
  request.accept(null, self.opts).then(({ peer, _ }) => {
    self._onPeer(peer, request.initiator)
  }).catch(reason => console.error(reason))
}

PeerTreeClient.prototype._onPeer = function (peer, id) {
  var self = this
  if (this.destroyed) return peer.destroy()

  if (self._upPeerIDs.indexOf(id) === -1) {
    peer.index = self._downPeers.length
    self._downPeers.push(peer)
    self.emit('downstreamPeer', peer)
  } else {
    peer.isUpstream = true
    self._upPeers.push(peer)
    self.emit('upstreamPeer', peer)
  }
  const timeout = setTimeout(() => {
    self._onClose(peer)
  }, self.opts.timeout)
  peer.once('connect', () => { clearTimeout(timeout) })
  peer.on('close', self._onClose.bind(self, peer))
  peer.on('error', (err) => {
    console.error(err)
    peer.destroy()
  })
}

PeerTreeClient.prototype._onClose = function (peer) {
  var self = this

  peer.destroy()
  if (peer.isUpstream) {
    self.reconnectUpstream()
  } else {
    self._downPeers.splice(peer.index, 1)
  }
}

PeerTreeClient.prototype._read = function () {}

PeerTreeClient.prototype._write = function (chunk, enc, next) {
  var self = this

  self._downPeers.forEach(function (peer) {
    peer.write(chunk)
  })
  next()
}

module.exports = PeerTreeClient
