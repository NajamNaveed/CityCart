jest.mock('../../src/services/ai/index', () => ({ generate: jest.fn() }));
jest.mock('../../src/services/discover.service', () => ({ discover: jest.fn() }));

const mongoose = require('mongoose');

const { generate } = require('../../src/services/ai/index');
const { discover } = require('../../src/services/discover.service');
const { runAgent, clip, MAX_RESULT_CHARS } = require('../../src/services/ai/agentLoop');
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

  it('logs a tool that throws instead of letting it look like an empty shop', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    discover.mockRejectedValue(new Error('inventory read timed out'));
    generate
      .mockResolvedValueOnce(modelSays({ tool: 'search_products', args: { query: 'rice' } }))
      .mockResolvedValueOnce(modelSays({ answer: 'I could not read the shop just now.' }));

    const { trace } = await runAgent({ ...base, ctx: toolCtx() });

    expect(trace[0]).toMatchObject({ tool: 'search_products', ok: false, error: 'inventory read timed out' });
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('[ai] tool search_products failed'));
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('inventory read timed out'));
    // The model is told the read failed and that a gap must not be filled in.
    expect(generate.mock.calls[1][0].messages.at(-1).content).toContain('could not run');
    expect(generate.mock.calls[1][0].messages.at(-1).content).toContain('Do not invent numbers');
    logged.mockRestore();
  });

  it('hands the model a shortened list it can see is shortened', async () => {
    // The tool's own page of results does not fit the prompt budget, so the loop
    // must cut it and say so. A silent cut in the middle of the JSON reads to a
    // model as the complete answer, and the shopper then gets "the shop has 4
    // items" about a shop that sent 60.
    const big = storeResult();
    big.items[0].products = Array.from({ length: 60 }, (unused, index) => ({
      _id: new mongoose.Types.ObjectId(),
      name: `Basmati Rice ${index} kg, ${'packed in the store the brand keeps on the top shelf of the godown behind the counter. '.repeat(9)}`,
      price: 480 + index,
      image: `https://res.cloudinary.com/citycart/image/upload/v1234567890/products/rice-${index}.jpg`,
      availability: 'IN_STOCK',
    }));
    discover.mockResolvedValue(big);
    generate
      .mockResolvedValueOnce(modelSays({ tool: 'search_products', args: { query: 'rice' } }))
      .mockResolvedValueOnce(modelSays({ answer: 'Rice is Rs 480.' }));

    const { trace } = await runAgent({ ...base, ctx: toolCtx() });

    const toolMessage = generate.mock.calls[1][0].messages.at(-1).content;
    expect(toolMessage).toContain('TRUNCATED');
    expect(toolMessage).toContain('of 8 items entries');
    expect(toolMessage).toContain('never name one that is not here');
    expect(toolMessage).not.toContain('rice-7');
    // What the model is given still parses, and the tool's own full result is
    // still in the trace: shortening the prompt must not lose the evidence.
    const json = toolMessage.slice(toolMessage.indexOf('{'), toolMessage.indexOf('\n\nTRUNCATED'));
    expect(JSON.parse(json).items.length).toBeLessThan(8);
    expect(trace[0].result.items).toHaveLength(8);
  });
});

describe('clip — what a too-long tool result looks like', () => {
  it('leaves a result that fits exactly as the tool returned it', () => {
    const result = { counts: { lowStock: 3 }, products: [{ productId: 'a', daysOfCover: 4 }] };
    expect(clip(result)).toBe(JSON.stringify(result));
  });

  it('drops whole entries from the biggest list and counts what it left out', () => {
    const rows = Array.from({ length: 40 }, (unused, index) => ({
      productId: `p${index}`,
      productName: 'Mulmul Dupatta, hand-finished, sold by the piece',
      availableQuantity: index,
    }));
    const text = clip({ counts: { lowStock: 40 }, products: rows });

    expect(text.length).toBeLessThanOrEqual(MAX_RESULT_CHARS);
    expect(text).toContain('TRUNCATED: this result shows the first');
    expect(text).toContain('of 40 products entries');
    expect(text).not.toContain('"productId":"p39"');
    const [, note] = text.split('\n\nTRUNCATED:');
    const kept = Number(note.match(/first (\d+)/)[1]);
    expect(JSON.parse(text.slice(0, text.indexOf('\n\nTRUNCATED:'))).products).toHaveLength(kept);
  });

  it('still caps a single oversized field instead of trusting it to be small', () => {
    const text = clip({ blob: 'x'.repeat(MAX_RESULT_CHARS * 2) });

    expect(text.length).toBeLessThanOrEqual(MAX_RESULT_CHARS);
    expect(text).toContain('TRUNCATED: the data above is incomplete');
    expect(text).not.toMatch(/[,{]$/);
  });
});
