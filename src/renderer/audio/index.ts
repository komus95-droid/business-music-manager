/**
 * Аудио-движок Commercial Player (Чат 4). Один вход:
 *   import { createAudioEngine, buildPlaylistRequest } from './audio';
 */

export { AudioEngine, createAudioEngine } from './engine';
export {
  buildPlaylistRequest, buildAnnouncementRequest, trackUrl, announcementUrl,
} from './resolvers';
export { toFileUrl, joinMedia } from './fileUrl';
export { EqChain, bandToDb } from './eq';
export type {
  PlayPlaylistRequest, PlayAnnouncementRequest, PlaylistTrackSrc,
  PlaybackState, PlaybackStatus, EngineConfig, Unsubscribe,
} from './types';
export type { PlaylistRequestOptions } from './resolvers';
