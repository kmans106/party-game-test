export enum GamePhase {
  Lobby = "lobby",
  Playing = "playing",
  Finished = "finished"
}

export type PlayerId = string;
export type RoomCode = string;

export type Player = {
  id: PlayerId;
  name: string;
  score: number;
  isConnected: boolean;
};

export enum ChatMessageType {
  Guess = "guess",
  System = "system",
  Correct = "correct"
}

export type ChatMessage = {
  id: string;
  type: ChatMessageType;
  playerId: PlayerId | null;
  playerName: string | null;
  text: string;
};

export enum TurnStage {
  ChoosingWord = "choosing_word",
  Drawing = "drawing",
  Intermission = "intermission"
}

export type ActiveGame = {
  roundNumber: number;
  totalRounds: number;
  turnIndex: number;
  currentDrawerPlayerId: PlayerId;
  turnStage: TurnStage;
  wordMask: string | null;
  revealedWord: string | null;
  revealedLetterIndices: number[];
  guessedPlayerIds: PlayerId[];
  phaseEndsAt: number | null;
};

export type LobbySettings = {
  totalRounds: number;
  roundTimerSeconds: number;
};

export type RoomState = {
  roomCode: RoomCode;
  phase: GamePhase;
  players: Player[];
  hostPlayerId: PlayerId | null;
  settings: LobbySettings;
  activeGame: ActiveGame | null;
  chatMessages: ChatMessage[];
};

export type CreateRoomInput = {
  playerName: string;
  playerSessionId: string;
};

export type JoinRoomInput = {
  roomCode: string;
  playerName: string;
  playerSessionId: string;
};

export type UpdateLobbySettingsInput = {
  totalRounds: number;
  roundTimerSeconds: number;
};

export type RoomJoinedPayload = {
  playerId: PlayerId;
  room: RoomState;
};

export type ChooseWordInput = {
  word: string;
};

export type DevBootstrapInput = {
  playerName: string;
  playerSessionId: string;
};

export type SubmitGuessInput = {
  guess: string;
};

export type DrawerStatePayload = {
  selectedWord: string | null;
  wordChoices: string[];
};

export type CanvasStroke = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  width: number;
};

export enum RoomErrorCode {
  AlreadyGuessed = "already_guessed",
  DuplicateName = "duplicate_name",
  GameAlreadyStarted = "game_already_started",
  InvalidGameState = "invalid_game_state",
  InvalidStroke = "invalid_stroke",
  InvalidGuess = "invalid_guess",
  InvalidLobbySettings = "invalid_lobby_settings",
  InvalidWordChoice = "invalid_word_choice",
  InvalidName = "invalid_name",
  InvalidRoomCode = "invalid_room_code",
  NotCurrentDrawer = "not_current_drawer",
  NotGuessingPhase = "not_guessing_phase",
  NotEnoughPlayers = "not_enough_players",
  NotHost = "not_host",
  DrawerCannotGuess = "drawer_cannot_guess",
  RoomNotFound = "room_not_found"
}

export type RoomErrorPayload = {
  code: RoomErrorCode;
  message: string;
};
