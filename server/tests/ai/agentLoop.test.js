jest.mock('../../src/services/ai/index', () => ({ generate: jest.fn() }));
jest.mock('../../src/services/discover.service', () => ({ discover: jest.fn() }));

const mongoose = require('mongoose');

const { generate } = require('../../src/services/ai/index');
const { discover } = require('../../src/services/discover.service');
const { runAgent } = require('../../src/services/ai/agentLoop');
const { createToolContext } = require('../../src/services/ai/tools');
const productTool = require('../../src/services/ai/tools/product.tool');

const productId = new mongoose.Types.ObjectId();
const brandId = new mongoose.Types.ObjectId();

function modelSays(value) {
  return { text: JSON.stringify(value), model: 'test', usage: {} };
}

function storeResult() {
  return {
    items: [
      {
        _id: brandId,
        name: 'Sahar Lifestyle',
        slug: 'sahar-lifestyle',
        acceptingNewOrders: true,
        nearestKm: 1,
        branches: [{ blockName: 'Centre', distanceKm: 1 }],
        products: [
          {
            _id: productId,
            name: 'Basmati Rice, 1 kg',
            price: 480,
            compareAtPrice: null,
            image: null,
            availability: 'IN_STOCK',
            availableAt: null,
          },
        ],
      },
    ],
    pagination: { page: 1, limit: 12, total: 1, pages: 1 },
    meta: {},
  };
}

function toolCtx() {
  return createToolContext({ userId: new mongoose.Types.ObjectId(), role: 'CUSTOMER' });
}

const base = {
  task: 'test-agent',
  system: 'You are a test agent.',
  user: 'Shopper question: rice',
  tools: [productTool],
};

beforeEach(() => {
  jest.clearAllMocks();
  discover.mockResolvedValue(storeResult());
});

describe('runAgent', () => {
  it('runs the tool when the model sends a tool and a ready answer together', async () => {
    generate
      .mockResolvedValueOnce(
        modelSays({ tool: 'search_products', args: { query: 'rice' }, answer: 'Rice costs Rs 99.' })
      )
      .mockResolvedValueOnce(modelSays({ answer: 'Basmati rice is Rs 480.', productIds: [String(productId)] }));

    const { decision, trace } = await runAgent({ ...base, ctx: toolCtx() });

    expect(discover).toHaveBeenCalledTimes(1);
    expect(trace).toHaveLength(1);
    expect(trace[0]).toMatchObject({ tool: 'search_products', ok: true, args: { query: 'rice' } });
    // The step's own result travels in the trace, because grounding the answer
    // checks every number in it against what the tool really returned.
    expect(trace[0].result.items).toEqual([expect.objectContaining({ name: 'Basmati Rice, 1 kg', price: 480 })]);
    expect(decision.answer).toBe('Basmati rice is Rs 480.');
  });

  it('returns a plain answer without calling a tool when no tool is needed', async () => {
    generate.mockResolvedValueOnce(modelSays({ answer: 'You can cancel an unpaid pending order.' }));

    const { decision, trace } = await runAgent({ ...base, ctx: toolCtx() });

    expect(discover).not.toHaveBeenCalled();
    expect(trace).toEqual([]);
    expect(decision.answer).toContain('cancel');
  });

  it('reports an unavailable tool to the model and continues', async () => {
    generate
      .mockResolvedValueOnce(modelSays({ tool: 'delete_everything', args: {} }))
      .mockResolvedValueOnce(modelSays({ answer: 'I can only read products here.' }));

    const result = await runAgent({ ...base, ctx: toolCtx() });

    expect(result.decision.answer).toContain('only read');
    const secondCallMessages = generate.mock.calls[1][0].messages;
    expect(secondCallMessages.some((m) => String(m.content).includes('"delete_everything" is not available'))).toBe(
      true,
    );
  });

});
