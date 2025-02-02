/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getGenAiTokenTracking, shouldTrackGenAiToken } from './gen_ai_token_tracking';
import { loggerMock } from '@kbn/logging-mocks';
import { getTokenCountFromBedrockInvoke } from './get_token_count_from_bedrock_invoke';
import { getTokenCountFromInvokeStream } from './get_token_count_from_invoke_stream';
import { IncomingMessage } from 'http';
import { Socket } from 'net';

jest.mock('./get_token_count_from_bedrock_invoke');
jest.mock('./get_token_count_from_invoke_stream');

const logger = loggerMock.create();

describe('getGenAiTokenTracking', () => {
  let mockGetTokenCountFromBedrockInvoke: jest.Mock;
  let mockGetTokenCountFromInvokeStream: jest.Mock;
  beforeEach(() => {
    mockGetTokenCountFromBedrockInvoke = (
      getTokenCountFromBedrockInvoke as jest.Mock
    ).mockResolvedValueOnce({
      total: 100,
      prompt: 50,
      completion: 50,
    });
    mockGetTokenCountFromInvokeStream = (
      getTokenCountFromInvokeStream as jest.Mock
    ).mockResolvedValueOnce({
      total: 100,
      prompt: 50,
      completion: 50,
    });
  });
  it('should return the total, prompt, and completion token counts when given a valid OpenAI response', async () => {
    const actionTypeId = '.gen-ai';

    const result = {
      actionId: '123',
      status: 'ok' as const,
      data: {
        usage: {
          total_tokens: 100,
          prompt_tokens: 50,
          completion_tokens: 50,
        },
      },
    };
    const validatedParams = {};

    const tokenTracking = await getGenAiTokenTracking({
      actionTypeId,
      logger,
      result,
      validatedParams,
    });

    expect(tokenTracking).toEqual({
      total_tokens: 100,
      prompt_tokens: 50,
      completion_tokens: 50,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should return the total, prompt, and completion token counts when given a valid Bedrock response', async () => {
    const actionTypeId = '.bedrock';

    const result = {
      actionId: '123',
      status: 'ok' as const,
      data: {
        completion: 'Sample completion',
      },
    };
    const validatedParams = {
      subAction: 'run',
      subActionParams: {
        body: 'Sample body',
      },
    };

    const tokenTracking = await getGenAiTokenTracking({
      actionTypeId,
      logger,
      result,
      validatedParams,
    });

    expect(tokenTracking).toEqual({
      total_tokens: 100,
      prompt_tokens: 50,
      completion_tokens: 50,
    });
    expect(logger.error).not.toHaveBeenCalled();
    expect(mockGetTokenCountFromBedrockInvoke).toHaveBeenCalledWith({
      response: 'Sample completion',
      body: 'Sample body',
    });
  });

  it('should return the total, prompt, and completion token counts when given a valid OpenAI streamed response', async () => {
    const mockReader = new IncomingMessage(new Socket());
    const actionTypeId = '.gen-ai';
    const result = {
      actionId: '123',
      status: 'ok' as const,
      data: mockReader,
    };
    const validatedParams = {
      subAction: 'invokeStream',
      subActionParams: {
        messages: [
          {
            role: 'user',
            content: 'Sample message',
          },
        ],
      },
    };

    const tokenTracking = await getGenAiTokenTracking({
      actionTypeId,
      logger,
      result,
      validatedParams,
    });

    expect(tokenTracking).toEqual({
      total_tokens: 100,
      prompt_tokens: 50,
      completion_tokens: 50,
    });
    expect(logger.error).not.toHaveBeenCalled();

    expect(JSON.stringify(mockGetTokenCountFromInvokeStream.mock.calls[0][0].body)).toStrictEqual(
      JSON.stringify({
        messages: [
          {
            role: 'user',
            content: 'Sample message',
          },
        ],
      })
    );
  });

  it('should return null when given an invalid OpenAI response', async () => {
    const actionTypeId = '.gen-ai';
    const result = {
      actionId: '123',
      status: 'ok' as const,
      data: {},
    };
    const validatedParams = {};

    const tokenTracking = await getGenAiTokenTracking({
      actionTypeId,
      logger,
      result,
      validatedParams,
    });

    expect(tokenTracking).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  describe('shouldTrackGenAiToken', () => {
    it('should be true with OpenAI action', () => {
      expect(shouldTrackGenAiToken('.gen-ai')).toEqual(true);
    });
    it('should be true with bedrock action', () => {
      expect(shouldTrackGenAiToken('.bedrock')).toEqual(true);
    });
    it('should be false with any other action', () => {
      expect(shouldTrackGenAiToken('.jira')).toEqual(false);
    });
  });
});
