const SimpleSignalServer = require('simple-signal-server')
const Tree = require('tree')
const cuid = require('cuid')

function PeerTreeServer (io, opts) {
  var self = this
  if (!(self instanceof PeerTreeServer)) return new PeerTreeServer(io, opts)

  opts = opts || {}

  self._signal = SimpleSignalServer(io)
  self._trees = {}
  self.k = opts.k || 4
  self.k1 = opts.k1 || 5

  self._signal.on('discover', self._onDiscover.bind(self))
  self._signal.on('request', self._onRequest.bind(self))
  self._signal.on('disconnect', self._onDisconnect.bind(self))
}

PeerTreeServer.prototype._onDiscover = function (request) {
  const self = this
  const socket = request.socket
  if (!request.discoveryData) {
    return request.discover(null, {
      err: 'no discoveryData'
    })
  }

  const id = socket.id
  const createNew = request.discoveryData.createNew || null

  if (createNew) {
    const treeID = cuid()
    if (self._trees[treeID]) {
      request.discover(null, {
        err: 'Tree already exists.'
      })
      return
    }
    if (socket._treeID) self._onDisconnect(socket)
    socket._treeNode = new Tree.Node(null, { id })
    socket._treeID = treeID
    socket._isRoot = true
    self._trees[treeID] = new Tree.Root(new Tree.Branch([socket._treeNode]))
    request.discover(id, {
      peers: [],
      treeID
    })
  } else {
    const treeID = request.discoveryData.treeID
    const tree = self._trees[treeID]
    if (!tree) {
      request.discover(id, {
        err: 'Tree does not exist.'
      })
    } else {
      const node = findNodeWithSpace(tree, self.k1, self.k)
      if (socket._treeID !== treeID) self._onDisconnect(socket)
      socket._treeNode = socket._treeNode || new Tree.Node(null, { id }) // reconnect the tree if possible
      socket._treeID = treeID
      socket._isRoot = false
      node.children.append(socket._treeNode)

      request.discover(id, {
        peers: [node.id],
        treeID
      })
    }
  }
}

function findNodeWithSpace (tree, k1, k) {
  // BFS to find the highest node with <k children
  var queue = []
  const rootNode = tree.branch.nodes[0]

  if (rootNode.children.nodes.length < k1) {
    return rootNode
  }
  queue.push(rootNode)

  while (queue.length > 0) {
    var node = queue.shift()

    if (node.children.nodes.length < k) {
      return node
    } else {
      node.children.nodes.forEach((node) => {
        queue.push(node)
      })
    }
  }
  return null
}

PeerTreeServer.prototype._onRequest = function (request) {
  request.forward()
}

PeerTreeServer.prototype._onDisconnect = function (socket) {
  const self = this

  if (socket._treeNode && socket._treeID) {
    if (socket._isRoot) {
      delete self._trees[socket._treeID]
    } else {
      socket._treeNode.branch.remove(socket._treeNode)
    }
  }
}

module.exports = PeerTreeServer
