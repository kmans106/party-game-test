export const CLIENT_EVENTS = {
  ping: "client:ping",
  devBootstrap: "dev:bootstrap",
  roomCreate: "room:create",
  roomJoin: "room:join",
  gameStart: "game:start",
  gameReturnToLobby: "game:return_to_lobby",
  turnChooseWord: "turn:choose_word",
  canvasStroke: "canvas:stroke",
  canvasClear: "canvas:clear",
  chatGuess: "chat:guess"
} as const;

export const SERVER_EVENTS = {
  connectionAck: "server:connection_ack",
  roomJoined: "room:joined",
  roomState: "room:state",
  roomError: "room:error",
  drawerState: "turn:drawer_state",
  canvasStroke: "canvas:stroke",
  canvasClear: "canvas:clear"
} as const;
