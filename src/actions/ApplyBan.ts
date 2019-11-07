/*
Copyright 2019 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import BanList from "../models/BanList";
import { RoomUpdateError } from "../models/RoomUpdateError";
import { Mjolnir } from "../Mjolnir";
import config from "../config";
import { logMessage } from "../LogProxy";
import { LogLevel } from "matrix-bot-sdk";
import { ERROR_KIND_FATAL, ERROR_KIND_PERMISSION } from "../ErrorCache";

/**
 * Applies the member bans represented by the ban lists to the provided rooms, returning the
 * room IDs that could not be updated and their error.
 * @param {BanList[]} lists The lists to determine bans from.
 * @param {string[]} roomIds The room IDs to apply the bans in.
 * @param {Mjolnir} mjolnir The Mjolnir client to apply the bans with.
 */
export async function applyUserBans(lists: BanList[], roomIds: string[], mjolnir: Mjolnir): Promise<RoomUpdateError[]> {
    // We can only ban people who are not already banned, and who match the rules.
    const errors: RoomUpdateError[] = [];
    let bansApplied = 0;
    for (const roomId of roomIds) {
        try {
            // We specifically use sendNotice to avoid having to escape HTML
            await logMessage(LogLevel.DEBUG, "ApplyBan", `Updating member bans in ${roomId}`);

            let members: { userId: string, membership: string }[];

            if (config.fasterMembershipChecks) {
                const memberIds = await mjolnir.client.getJoinedRoomMembers(roomId);
                members = memberIds.map(u => {
                    return {userId: u, membership: "join"};
                });
            } else {
                const state = await mjolnir.client.getRoomState(roomId);
                members = state.filter(s => s['type'] === 'm.room.member' && !!s['state_key']).map(s => {
                    return {userId: s['state_key'], membership: s['content'] ? s['content']['membership'] : 'leave'};
                });
            }

            for (const member of members) {
                if (member.membership === 'ban') {
                    continue; // user already banned
                }

                let banned = false;
                for (const list of lists) {
                    for (const userRule of list.userRules) {
                        if (userRule.isMatch(member.userId)) {
                            // User needs to be banned

                            // We specifically use sendNotice to avoid having to escape HTML
                            await logMessage(LogLevel.DEBUG, "ApplyBan", `Banning ${member.userId} in ${roomId} for: ${userRule.reason}`);

                            if (!config.noop) {
                                await mjolnir.client.banUser(member.userId, roomId, userRule.reason);
                            } else {
                                await logMessage(LogLevel.WARN, "ApplyBan", `Tried to ban ${member.userId} in ${roomId} but Mjolnir is running in no-op mode`);
                            }

                            bansApplied++;
                            banned = true;
                            break;
                        }
                    }
                    if (banned) break;
                }
            }
        } catch (e) {
            const message = e.message || (e.body ? e.body.error : '<no message>');
            errors.push({
                roomId,
                errorMessage: message,
                errorKind: message.includes("You don't have permission to ban") ? ERROR_KIND_PERMISSION : ERROR_KIND_FATAL,
            });
        }
    }

    if (bansApplied > 0) {
        const html = `<font color="#00cc00"><b>Banned ${bansApplied} people</b></font>`;
        const text = `Banned ${bansApplied} people`;
        await this.client.sendMessage(config.managementRoom, {
            msgtype: "m.notice",
            body: text,
            format: "org.matrix.custom.html",
            formatted_body: html,
        });
    }

    return errors;
}
