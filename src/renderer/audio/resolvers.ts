/**
 * Адаптеры доменная модель → команды движка (Чат 4).
 * Здесь единственное место, где собираются `file://`-URL из mediaPath.
 *   трек:       {mediaPath}/playlists/{playlistId}/{track.file}
 *   объявление: {mediaPath}/announcements/{announcement.file}
 */

import type { Playlist, Announcement } from '@shared';
import { joinMedia, toFileUrl } from './fileUrl';
import type {
  PlayPlaylistRequest,
  PlayAnnouncementRequest,
  PlaylistTrackSrc,
} from './types';

export function trackUrl(mediaPath: string, playlistId: string, file: string): string {
  return toFileUrl(joinMedia(mediaPath, 'playlists', playlistId, file));
}

export function announcementUrl(mediaPath: string, file: string): string {
  return toFileUrl(joinMedia(mediaPath, 'announcements', file));
}

export interface PlaylistRequestOptions {
  startIndex?: number;
  startOffsetSec?: number;
  loop?: boolean;
}

/** Playlist (+ mediaPath) → команда запуска с резолвнутыми URL треков. */
export function buildPlaylistRequest(
  mediaPath: string,
  pl: Playlist,
  opts: PlaylistRequestOptions = {},
): PlayPlaylistRequest {
  const tracks: PlaylistTrackSrc[] = pl.tracks.map((t) => ({
    id: t.id,
    name: t.name,
    durationSec: t.durationSec,
    url: trackUrl(mediaPath, pl.id, t.file),
  }));
  return {
    playlistId: pl.id,
    name: pl.name,
    crossfade: pl.crossfade,
    tracks,
    ...opts,
  };
}

/** Announcement (+ mediaPath) → команда запуска объявления. */
export function buildAnnouncementRequest(
  mediaPath: string,
  a: Announcement,
): PlayAnnouncementRequest {
  return {
    announcementId: a.id,
    name: a.name,
    url: announcementUrl(mediaPath, a.file),
    volume: a.volume,
  };
}
