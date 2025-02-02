/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readFile } from 'fs/promises';

import fetch from 'node-fetch';

let mockKibanaVersion = '300.0.0';
let mockConfig = {};
jest.mock('../app_context', () => {
  const { loggerMock } = jest.requireActual('@kbn/logging-mocks');
  return {
    appContextService: {
      getLogger: () => loggerMock.create(),
      getKibanaVersion: () => mockKibanaVersion,
      getConfig: () => mockConfig,
    },
  };
});

jest.mock('fs/promises');
jest.mock('node-fetch');

const mockedReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

const emptyResponse = {
  status: 200,
  text: jest.fn().mockResolvedValue(JSON.stringify({})),
} as any;

import { getAvailableVersions } from './versions';

describe('getAvailableVersions', () => {
  beforeEach(() => {
    mockedReadFile.mockReset();
    mockedFetch.mockReset();
  });

  it('should return available version and filter version < 7.17', async () => {
    mockKibanaVersion = '300.0.0';
    mockedReadFile.mockResolvedValue(`["8.1.0", "8.0.0", "7.17.0", "7.16.0"]`);
    mockedFetch.mockResolvedValueOnce(emptyResponse);

    const res = await getAvailableVersions({ includeCurrentVersion: true, ignoreCache: true });

    expect(res).toEqual(['300.0.0', '8.1.0', '8.0.0', '7.17.0']);
  });

  it('should not strip -SNAPSHOT from kibana version', async () => {
    mockKibanaVersion = '300.0.0-SNAPSHOT';
    mockedReadFile.mockResolvedValue(`["8.1.0", "8.0.0", "7.17.0", "7.16.0"]`);
    mockedFetch.mockResolvedValueOnce(emptyResponse);

    const res = await getAvailableVersions({ includeCurrentVersion: true, ignoreCache: true });
    expect(res).toEqual(['300.0.0-SNAPSHOT', '8.1.0', '8.0.0', '7.17.0']);
  });

  it('should not include the current version if includeCurrentVersion is not set', async () => {
    mockKibanaVersion = '300.0.0-SNAPSHOT';
    mockConfig = {
      internal: {
        onlyAllowAgentUpgradeToKnownVersions: true,
      },
    };
    mockedReadFile.mockResolvedValue(`["8.1.0", "8.0.0", "7.17.0", "7.16.0"]`);
    mockedFetch.mockResolvedValueOnce(emptyResponse);

    const res = await getAvailableVersions({ ignoreCache: true });

    expect(res).toEqual(['8.1.0', '8.0.0', '7.17.0']);
  });

  it('should not include the current version if includeCurrentVersion = false', async () => {
    mockKibanaVersion = '300.0.0-SNAPSHOT';
    mockedReadFile.mockResolvedValue(`["8.1.0", "8.0.0", "7.17.0", "7.16.0"]`);
    mockedFetch.mockResolvedValueOnce(emptyResponse);

    const res = await getAvailableVersions({ includeCurrentVersion: false, ignoreCache: true });

    expect(res).toEqual(['8.1.0', '8.0.0', '7.17.0']);
  });

  it('should return kibana version only if cannot read versions', async () => {
    mockKibanaVersion = '300.0.0';
    mockConfig = {
      internal: {
        onlyAllowAgentUpgradeToKnownVersions: false,
      },
    };
    mockedReadFile.mockRejectedValue({ code: 'ENOENT' });
    mockedFetch.mockResolvedValueOnce(emptyResponse);

    const res = await getAvailableVersions({ ignoreCache: true });

    expect(res).toEqual(['300.0.0']);
  });

  it('should include versions returned from product_versions API', async () => {
    mockKibanaVersion = '300.0.0';
    mockedReadFile.mockResolvedValue(`["8.1.0", "8.0.0", "7.17.0", "7.16.0"]`);
    mockedFetch.mockResolvedValueOnce({
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify([
          [
            {
              title: 'Elastic Agent 8.1.0',
              version_number: '8.1.0',
            },
            {
              title: 'Elastic Agent 8.10.0',
              version_number: '8.10.0',
            },
            {
              title: 'Elastic Agent 8.9.2',
              version_number: '8.9.2',
            },
            ,
          ],
        ])
      ),
    } as any);

    const res = await getAvailableVersions({ ignoreCache: true });

    // Should sort, uniquify and filter out versions < 7.17
    expect(res).toEqual(['8.10.0', '8.9.2', '8.1.0', '8.0.0', '7.17.0']);
  });

  it('should cache results', async () => {
    mockKibanaVersion = '300.0.0';
    mockedReadFile.mockResolvedValue(`["8.1.0", "8.0.0", "7.17.0", "7.16.0"]`);
    mockedFetch.mockResolvedValueOnce({
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify([
          [
            {
              title: 'Elastic Agent 8.1.0',
              version_number: '8.1.0',
            },
            {
              title: 'Elastic Agent 8.10.0',
              version_number: '8.10.0',
            },
            {
              title: 'Elastic Agent 8.9.2',
              version_number: '8.9.2',
            },
            ,
          ],
        ])
      ),
    } as any);

    await getAvailableVersions();

    mockedFetch.mockResolvedValueOnce({
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify([
          [
            {
              title: 'Elastic Agent 300.0.0',
              version_number: '300.0.0',
            },
          ],
        ])
      ),
    } as any);

    const res2 = await getAvailableVersions();

    expect(mockedFetch).toBeCalledTimes(1);
    expect(res2).not.toContain('300.0.0');
  });
});
