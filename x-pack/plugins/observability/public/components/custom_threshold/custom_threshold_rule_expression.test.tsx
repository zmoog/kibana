/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act } from 'react-dom/test-utils';
import { QueryClientProvider } from '@tanstack/react-query';
import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import { queryClient } from '@kbn/osquery-plugin/public/query_client';
import { mountWithIntl, nextTick } from '@kbn/test-jest-helpers';

import { Aggregators, Comparator } from '../../../common/custom_threshold_rule/types';
import { useKibana } from '../../utils/kibana_react';
import { kibanaStartMock } from '../../utils/kibana_react.mock';
import Expressions from './custom_threshold_rule_expression';

jest.mock('../../utils/kibana_react');
jest.mock('./components/preview_chart/preview_chart', () => ({
  PreviewChart: jest.fn(() => <div data-test-subj="ExpressionChart" />),
}));

const useKibanaMock = useKibana as jest.Mock;

const mockKibana = () => {
  useKibanaMock.mockReturnValue({
    ...kibanaStartMock.startContract(),
  });
};

const dataViewMock = dataViewPluginMocks.createStartContract();

describe('Expression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKibana();
  });

  async function setup() {
    const ruleParams = {
      criteria: [],
      groupBy: undefined,
      sourceId: 'default',
      searchConfiguration: {
        index: 'mockedIndex',
        query: {
          query: '',
          language: 'kuery',
        },
      },
    };
    const wrapper = mountWithIntl(
      <QueryClientProvider client={queryClient}>
        <Expressions
          ruleInterval="1m"
          ruleThrottle="1m"
          alertNotifyWhen="onThrottleInterval"
          ruleParams={ruleParams}
          errors={{}}
          setRuleParams={(key, value) => Reflect.set(ruleParams, key, value)}
          setRuleProperty={() => {}}
          metadata={{
            adHocDataViewList: [],
          }}
          dataViews={dataViewMock}
          onChangeMetaData={jest.fn()}
        />
      </QueryClientProvider>
    );

    const update = async () =>
      await act(async () => {
        await nextTick();
        wrapper.update();
      });

    await update();

    return { wrapper, update, ruleParams };
  }

  it('should use default metrics', async () => {
    const { ruleParams } = await setup();
    expect(ruleParams.criteria).toEqual([
      {
        metrics: [
          {
            name: 'A',
            aggType: Aggregators.COUNT,
          },
        ],
        comparator: Comparator.GT,
        threshold: [1000],
        timeSize: 1,
        timeUnit: 'm',
        aggType: 'custom',
      },
    ]);
  });

  it('should show an error message when searchSource throws an error', async () => {
    const errorMessage = 'Error in searchSource create';
    const kibanaMock = kibanaStartMock.startContract();
    useKibanaMock.mockReturnValue({
      ...kibanaMock,
      services: {
        ...kibanaMock.services,
        data: {
          dataViews: {
            create: jest.fn(),
          },
          query: {
            timefilter: {
              timefilter: jest.fn(),
            },
          },
          search: {
            searchSource: {
              create: jest.fn(() => {
                throw new Error(errorMessage);
              }),
            },
          },
        },
      },
    });
    const { wrapper } = await setup();
    expect(wrapper.find(`[data-test-subj="thresholdRuleExpressionError"]`).first().text()).toBe(
      errorMessage
    );
  });

  it('should show no timestamp error when selected data view does not have a timeField', async () => {
    const mockedIndex = {
      id: 'c34a7c79-a88b-4b4a-ad19-72f6d24104e4',
      title: 'metrics-fake_hosts',
      fieldFormatMap: {},
      typeMeta: {},
      // We should not provide timeFieldName here to show thresholdRuleDataViewErrorNoTimestamp error
      // timeFieldName: '@timestamp',
    };
    const mockedDataView = {
      getIndexPattern: () => 'mockedIndexPattern',
      getName: () => 'mockedName',
      ...mockedIndex,
    };
    const mockedSearchSource = {
      id: 'data_source',
      shouldOverwriteDataViewType: false,
      requestStartHandlers: [],
      inheritOptions: {},
      history: [],
      fields: {
        index: mockedIndex,
      },
      getField: jest.fn(() => mockedDataView),
      dependencies: {
        aggs: {
          types: {},
        },
      },
    };
    const kibanaMock = kibanaStartMock.startContract();
    useKibanaMock.mockReturnValue({
      ...kibanaMock,
      services: {
        ...kibanaMock.services,
        data: {
          dataViews: {
            create: jest.fn(),
          },
          query: {
            timefilter: {
              timefilter: jest.fn(),
            },
          },
          search: {
            searchSource: {
              create: jest.fn(() => mockedSearchSource),
            },
          },
        },
      },
    });
    const { wrapper } = await setup();
    expect(
      wrapper.find(`[data-test-subj="thresholdRuleDataViewErrorNoTimestamp"]`).first().text()
    ).toBe(
      'The selected data view does not have a timestamp field, please select another data view.'
    );
  });
});
