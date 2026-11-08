jest.mock('../src/sockets', () => ({ emitChat: jest.fn() }));

const mongoose = require('mongoose');

const ProviderConversation = require('../src/models/providerConversation.model');
const ProviderMessage = require('../src/models/providerMessage.model');
const ServiceProvider = require('../src/models/serviceProvider.model');
const { emitChat } = require('../src/sockets');
const {
  ProviderChatError,
  startConversation,
  listMessages,
  sendMessage,
  markRead,
  unreadCount,
  listConversations,
} = require('../src/services/serviceDirectChat.service');

const oid = () => new mongoose.Types.ObjectId();

const customerId = oid();
const providerId = oid();
const otherCustomerId = oid();
const otherProviderId = oid();

const conversationDoc = (over = {}) => ({
  _id: oid(),
  customerId,
  providerId,
  lastMessageAt: new Date('2026-11-08T10:00:00Z'),
  lastMessagePreview: 'Is Saturday free?',
  lastSenderRole: 'CUSTOMER',
  customerUnread: 0,
  providerUnread: 2,
  ...over,
});

const customer = (id = customerId) => ({ _id: id, role: 'CUSTOMER' });
const provider = (tenant = providerId) => ({ _id: oid(), role: 'SERVICE_PROVIDER', providerId: tenant });

afterEach(() => jest.restoreAllMocks());

describe('access control', () => {
  it('hides a conversation from a customer who is not the member', async () => {
    jest.spyOn(ProviderConversation, 'findById').mockResolvedValue(conversationDoc());
    await expect(listMessages(customer(otherCustomerId), oid())).rejects.toMatchObject({ status: 404 });
  });

  it('hides a conversation from a different provider tenant', async () => {
    jest.spyOn(ProviderConversation, 'findById').mockResolvedValue(conversationDoc());
    await expect(listMessages(provider(otherProviderId), oid())).rejects.toMatchObject({ status: 404 });
  });

  it('hides a provider conversation from a brand staff session', async () => {
    jest.spyOn(ProviderConversation, 'findById').mockResolvedValue(conversationDoc());
    await expect(listMessages({ _id: oid(), role: 'BRAND_ADMIN' }, oid())).rejects.toMatchObject({ status: 404 });
  });
});

describe('sending', () => {
  it('increments the other side only, and marks the message as mine for the sender', async () => {
    const conversation = conversationDoc();
    jest.spyOn(ProviderConversation, 'findById').mockResolvedValue(conversation);
    jest.spyOn(ProviderConversation, 'updateOne').mockResolvedValue({});
    jest.spyOn(ProviderMessage, 'create').mockResolvedValue({
      _id: oid(),
      conversationId: conversation._id,
      senderRole: 'CUSTOMER',
      body: 'Is Saturday free?',
      createdAt: new Date('2026-11-08T10:05:00Z'),
    });
    jest.spyOn(ServiceProvider, 'findById').mockReturnValue({ select: async () => ({ userId: oid() }) });

    const message = await sendMessage(customer(), conversation._id, { body: '  Is Saturday free?  ' });

    expect(message.body).toBe('Is Saturday free?');
    expect(message.mine).toBe(true);
    const [, update] = ProviderConversation.updateOne.mock.calls[0];
    expect(update.$inc).toEqual({ providerUnread: 1 });
    expect(emitChat).toHaveBeenCalledTimes(2);
  });

  it('rejects an empty body after cleaning', async () => {
    jest.spyOn(ProviderConversation, 'findById').mockResolvedValue(conversationDoc());
    await expect(sendMessage(customer(), oid(), { body: '  \u0000  ' })).rejects.toBeInstanceOf(ProviderChatError);
  });
});

describe('startConversation', () => {
  it('refuses a provider who is not publicly available', async () => {
    jest.spyOn(ServiceProvider, 'findOne').mockReturnValue({ select: async () => null });
    await expect(startConversation(customerId, providerId)).rejects.toMatchObject({ status: 404 });
  });

  it('reuses the one thread a pair already has', async () => {
    const conversation = conversationDoc();
    jest.spyOn(ServiceProvider, 'findOne').mockReturnValue({
      select: async () => ({ _id: providerId, displayName: 'Sparkle Home', avatar: null, slug: 'sparkle-home' }),
    });
    jest.spyOn(ProviderConversation, 'findOne').mockResolvedValue(conversation);
    const create = jest.spyOn(ProviderConversation, 'create');

    const result = await startConversation(customerId, providerId);

    expect(result.conversationId).toBe(conversation._id);
    expect(result.provider.name).toBe('Sparkle Home');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('unread', () => {
  it('answers zero for a provider session without a tenant', async () => {
    await expect(unreadCount({ _id: oid(), role: 'SERVICE_PROVIDER', providerId: null })).resolves.toBe(0);
  });

  it('clears only the reader side', async () => {
    const conversation = conversationDoc({ providerUnread: 0, customerUnread: 4 });
    jest.spyOn(ProviderConversation, 'findById').mockResolvedValue(conversation);
    const update = jest.spyOn(ProviderConversation, 'updateOne').mockResolvedValue({});

    await markRead(customer(), conversation._id);

    expect(update.mock.calls[0][1].$set).toEqual({ customerUnread: 0 });
  });
});

describe('listConversations', () => {
  it('scopes a provider to its own tenant', async () => {
    const find = jest.spyOn(ProviderConversation, 'find').mockReturnValue({
      sort: () => ({ skip: () => ({ limit: async () => [] }) }),
    });
    jest.spyOn(ProviderConversation, 'countDocuments').mockResolvedValue(0);

    await listConversations(provider(), { page: 1, limit: 20 });

    expect(find.mock.calls[0][0]).toEqual({ providerId });
  });

  it('scopes a customer to its own id and resolves the provider name', async () => {
    const conversation = conversationDoc();
    jest.spyOn(ProviderConversation, 'find').mockReturnValue({
      sort: () => ({ skip: () => ({ limit: async () => [conversation] }) }),
    });
    jest.spyOn(ProviderConversation, 'countDocuments').mockResolvedValue(1);
    jest.spyOn(ServiceProvider, 'find').mockReturnValue({
      select: async () => [{ _id: providerId, displayName: 'Sparkle Home', avatar: null, slug: 'sparkle-home' }],
    });

    const result = await listConversations(customer(), { page: 1, limit: 20 });

    expect(result.conversations[0].with).toMatchObject({ name: 'Sparkle Home', slug: 'sparkle-home' });
    expect(result.conversations[0].unread).toBe(0);
  });
});
