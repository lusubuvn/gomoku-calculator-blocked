const EMPTY = 0,
  BLACK = 1,
  WHITE = 2

function toIndex(p, size) {
  if (p[0] < 0 || p[1] < 0 || p[0] >= size || p[1] >= size) return -1
  else return p[1] * size + p[0]
}

function checkLine(board, pos, delta, size, exactFive = false) {
  let piece = board[toIndex(pos, size)]
  let count = 1,
    i,
    j
  for (i = 1; ; i++) {
    let x = pos[0] + delta[0] * i
    let y = pos[1] + delta[1] * i
    let index = toIndex([x, y], size)
    if (index == -1) break
    if (board[index] == piece) count++
    else break
  }
  for (j = 1; ; j++) {
    let x = pos[0] - delta[0] * j
    let y = pos[1] - delta[1] * j
    let index = toIndex([x, y], size)
    if (index == -1) break
    if (board[index] == piece) count++
    else break
  }
  if (exactFive ? count == 5 : count >= 5) return [1 - j, i - 1]
}

const state = {
  size: 15,
  board: null,
  position: [],
  /* 棋子序列数组,每个元素为一个表示坐标的二维向量[x, y] */
  lastPosition: [],
  winline: [],
  swaped: false,
  blocked: [],
}

const getters = {
  posStr: (state) => {
    let posStrs = []
    for (let p of state.position) {
      posStrs.push(String.fromCharCode('a'.charCodeAt(0) + p[0]))
      posStrs.push(state.size - p[1])
    }
    return posStrs.join('')
  },
  get: (state) => {
    return (pos) => {
      switch (state.board[toIndex(pos, state.size)]) {
        case BLACK:
          return 'BLACK'
        case WHITE:
          return 'WHITE'
        case EMPTY:
          return 'EMPTY'
        default:
          return 'ERROR'
      }
    }
  },
  isEmpty: (state) => {
    return (pos) => {
      return state.board[toIndex(pos, state.size)] == EMPTY && !state.blocked.some((p) => p[0] == pos[0] && p[1] == pos[1])
    }
  },
  isBlocked: (state) => {
    return (pos) => {
      return state.blocked.some((p) => p[0] == pos[0] && p[1] == pos[1])
    }
  },
  isInBoard: (state) => {
    return (pos) => {
      return toIndex(pos, state.size) != -1
    }
  },
  playerToMove: (state) => {
    return state.position.length % 2 == 0 ? 'BLACK' : 'WHITE'
  },
  moveLeftCount: (state) => {
    return Math.max(0, state.size * state.size - state.position.length - state.blocked.length)
  },
  marchPosition: (state) => {
    return (position) => {
      let len = Math.min(position.length, state.position)
      let i = 0
      for (; i < len; i++) {
        let pos1 = position[i]
        let pos2 = state.position[i]
        if (pos1[0] != pos2[0] || pos1[1] != pos2[1]) break
      }
      return i
    }
  },
}

const mutations = {
  new(state, size) {
    state.size = size
    state.board = new Uint8Array(state.size * state.size).fill(EMPTY)
    state.lastPosition = []
    state.position = []
    state.winline = []
    state.swaped = false
    state.blocked = []
  },
  move(state, pos) {
    state.board[pos[1] * state.size + pos[0]] = state.position.length % 2 == 0 ? BLACK : WHITE
    state.position.push(pos)

    let lastPos = state.lastPosition[state.position.length - 1]
    if (!lastPos || lastPos[0] != pos[0] || lastPos[1] != pos[1]) {
      state.lastPosition = [...state.position] // 走向不同的分支
    }
  },
  undo(state) {
    let pos = state.position.pop()
    state.board[pos[1] * state.size + pos[0]] = EMPTY
    state.winline = []
  },
  checkWin(state, checkOverline) {
    if (state.position.length < 9) return

    let lastPos = state.position[state.position.length - 1]
    const dirs = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ]
    for (let dir of dirs) {
      let ret = checkLine(state.board, lastPos, dir, state.size, checkOverline)
      if (ret) {
        return (state.winline = [
          [lastPos[0] + ret[0] * dir[0], lastPos[1] + ret[0] * dir[1]],
          [lastPos[0] + ret[1] * dir[0], lastPos[1] + ret[1] * dir[1]],
        ])
      }
    }
  },
  checkAnyWin(state) {
    state.winline = []
    const dirs = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ]
    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        const index = y * state.size + x
        if (state.board[index] == EMPTY) continue
        for (const dir of dirs) {
          const prev = [x - dir[0], y - dir[1]]
          const prevIndex = toIndex(prev, state.size)
          if (prevIndex >= 0 && state.board[prevIndex] == state.board[index]) continue
          let count = 1
          let endX = x
          let endY = y
          while (true) {
            endX += dir[0]
            endY += dir[1]
            const nextIndex = toIndex([endX, endY], state.size)
            if (nextIndex < 0 || state.board[nextIndex] != state.board[index]) break
            count++
          }
          if (count >= 5) {
            return (state.winline = [[x, y], [endX - dir[0], endY - dir[1]]])
          }
        }
      }
    }
  },
  setSwaped(state) {
    state.swaped = true
  },
  toggleBlocked(state, pos) {
    const index = state.blocked.findIndex((p) => p[0] == pos[0] && p[1] == pos[1])
    if (index >= 0) {
      state.blocked.splice(index, 1)
    } else if (state.board[toIndex(pos, state.size)] == EMPTY && toIndex(pos, state.size) >= 0) {
      state.blocked.push([pos[0], pos[1]])
    }
  },
  clearBlocked(state) {
    state.blocked = []
  },
  loadImported(state, payload) {
    const size = payload.boardSize
    state.size = size
    state.board = new Uint8Array(size * size).fill(EMPTY)
    state.position = []
    state.lastPosition = []
    state.winline = []
    state.swaped = false
    state.blocked = []

    const seen = new Set()
    const place = (pos, piece) => {
      const x = pos[0]
      const y = pos[1]
      if (x < 0 || y < 0 || x >= size || y >= size) return
      const key = x + ',' + y
      if (seen.has(key)) return
      if (payload.blocked.some((p) => p[0] == x && p[1] == y)) return
      seen.add(key)
      state.board[y * size + x] = piece
    }

    for (const pos of payload.black) place(pos, BLACK)
    for (const pos of payload.white) place(pos, WHITE)
    state.blocked = payload.blocked
      .filter((pos) => pos[0] >= 0 && pos[1] >= 0 && pos[0] < size && pos[1] < size)
      .map((pos) => [pos[0], pos[1]])

    // An image does not contain move order. Build a deterministic alternating
    // history so the engine can receive the same final position.
    const count = Math.max(payload.black.length, payload.white.length)
    for (let i = 0; i < count; i++) {
      const black = payload.black[i]
      const white = payload.white[i]
      if (black && state.board[black[1] * size + black[0]] == BLACK) state.position.push([black[0], black[1]])
      if (white && state.board[white[1] * size + white[0]] == WHITE) state.position.push([white[0], white[1]])
    }
    state.lastPosition = [...state.position]
  },
}

const actions = {
  setPosStr({ commit, dispatch, getters, state }, str) {
    str = str.trim().toLowerCase()
    let posArray = str.match(/([a-z])(\d+)/g)
    if (getters.posStr == str) return

    commit('new', state.size)
    if (!posArray) return
    for (let p of posArray) {
      let x = p.match(/[a-z]/)[0].charCodeAt(0) - 'a'.charCodeAt(0)
      let y = state.size - +p.match(/\d+/)[0]
      dispatch('makeMove', [x, y])
      if (state.winline.length > 0) break
    }
  },
  makeMove({ commit, dispatch, getters }, pos) {
    if (!getters.isEmpty(pos)) return false
    commit('move', pos)
    commit('checkWin', false)
    dispatch('ai/checkForbid', {}, { root: true })
    return true
  },
  toggleBlocked({ commit, dispatch, state, getters }, pos) {
    if (state.board[toIndex(pos, state.size)] != EMPTY && !getters.isBlocked(pos)) return false
    commit('toggleBlocked', pos)
    dispatch('ai/syncBlocks', {}, { root: true })
    return true
  },
  clearBlocked({ commit, dispatch }) {
    commit('clearBlocked')
    dispatch('ai/syncBlocks', {}, { root: true })
  },
  importBoard({ commit, dispatch, state }, payload) {
    if (!payload || !payload.boardSize) return false
    commit('loadImported', payload)
    dispatch('ai/restart', {}, { root: true })
    commit('checkAnyWin')
    dispatch('ai/checkForbid', {}, { root: true })
    dispatch('ai/syncBlocks', {}, { root: true })
    return true
  },
  backward({ commit, dispatch }) {
    if (state.position.length == 0) return
    commit('undo')
    dispatch('ai/checkForbid', {}, { root: true })
  },
  forward({ commit, dispatch, state }) {
    if (state.lastPosition.length <= state.position.length) return
    commit('move', state.lastPosition[state.position.length])
    commit('checkWin', false)
    dispatch('ai/checkForbid', {}, { root: true })
  },
  backToBegin({ dispatch, state }) {
    while (state.position.length > 0) {
      dispatch('backward')
    }
  },
  forwardToEnd({ dispatch, state }) {
    while (state.lastPosition.length > state.position.length) dispatch('forward')
  },
  rotate({ commit, dispatch, state }) {
    let position = state.position.map((p) => [state.size - 1 - p[1], p[0]])
    let blocked = state.blocked.map((p) => [state.size - 1 - p[1], p[0]])
    commit('new', state.size)
    for (let p of blocked) commit('toggleBlocked', p)
    for (let p of position) dispatch('makeMove', p)
    dispatch('ai/syncBlocks', {}, { root: true })
  },
  flip({ commit, dispatch, state }, dir) {
    let transform = (p) => {
      p = [p[0], p[1]]
      if (dir[0] == 0 && dir[1] == 0) p = [p[1], p[0]]
      else if (dir[0] == 1 && dir[1] == 1) p = [state.size - 1 - p[1], state.size - 1 - p[0]]
      else if (dir[0] == 1) p[0] = state.size - 1 - p[0]
      else if (dir[1] == 1) p[1] = state.size - 1 - p[1]
      return p
    }
    let position = state.position.map(transform)
    let blocked = state.blocked.map(transform)
    commit('new', state.size)
    for (let p of blocked) commit('toggleBlocked', p)
    for (let p of position) dispatch('makeMove', p)
    dispatch('ai/syncBlocks', {}, { root: true })
  },
  moveTowards({ commit, dispatch, state }, dir) {
    let position = state.position.map((p) => [p[0] + dir[0], p[1] + dir[1]])
    let blocked = state.blocked.map((p) => [p[0] + dir[0], p[1] + dir[1]])
    commit('new', state.size)
    for (let p of blocked) {
      if (toIndex(p, state.size) >= 0) commit('toggleBlocked', p)
    }
    for (let p of position) dispatch('makeMove', p)
    dispatch('ai/syncBlocks', {}, { root: true })
  },

}

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations,
}
