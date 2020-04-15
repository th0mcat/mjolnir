/*
Copyright 2019, 2020 The Matrix.org Foundation C.I.C.

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

import { LogLevel, LogService } from "matrix-bot-sdk";
import config from "./config";
import { replaceRoomIdsWithPills } from "./utils";

const levelToFn = {
    [LogLevel.DEBUG.toString()]: LogService.debug,
    [LogLevel.INFO.toString()]: LogService.info,
    [LogLevel.WARN.toString()]: LogService.warn,
    [LogLevel.ERROR.toString()]: LogService.error,
};

export async function logMessage(level: LogLevel, module: string, message: string | any, additionalRoomIds: string[] | string = null) {
    if (!additionalRoomIds) additionalRoomIds = [];
    if (!Array.isArray(additionalRoomIds)) additionalRoomIds = [additionalRoomIds];

    if (config.RUNTIME.client && (config.verboseLogging || LogLevel.INFO.includes(level))) {
        let clientMessage = message;
        if (level === LogLevel.WARN) clientMessage = `⚠ | ${message}`;
        if (level === LogLevel.ERROR) clientMessage = `‼ | ${message}`;

        const roomIds = [config.managementRoom, ...additionalRoomIds];
        const client = config.RUNTIME.client;

        const evContent = await replaceRoomIdsWithPills(client, clientMessage, roomIds, "m.notice");
        await client.sendMessage(config.managementRoom, evContent);
    }

    levelToFn[level.toString()](module, message);
}
