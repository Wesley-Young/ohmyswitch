/**
 * API endpoints a provider can serve, named the same way as in ohmyapi. The order is the display order;
 * append new endpoints at the end.
 */
export const endpoints = ['/v1/chat/completions', '/v1/responses', '/v1/messages', '/v1beta/generateContent'] as const;

export type Endpoint = (typeof endpoints)[number];
