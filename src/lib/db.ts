/**
 * src/lib/db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * DynamoDB data access layer.
 * All API routes import from here — keeps DB logic in one place.
 *
 * In dev (no DYNAMODB_TABLE env var) every function falls back to in-memory
 * stubs so you can run `npm run dev` without AWS credentials.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Product    = 'kombucha' | 'sobolo' | 'salve';
export type Status     = 'pending' | 'approved' | 'rejected';
export type EntityType = 'REVIEW' | 'POST' | 'EVENT';

export interface Review {
  id: string; entityType: 'REVIEW';
  product: Product; name: string; email: string;
  body: string; rating: number;
  status: Status; createdAt: string; updatedAt: string;
}

export interface Post {
  id: string; entityType: 'POST';
  title: string; excerpt: string; body: string;
  status: Status; createdAt: string; updatedAt: string;
}

export interface Event {
  id: string; entityType: 'EVENT';
  title: string; date: string; time: string;
  location: string; description: string;
  status: Status; createdAt: string; updatedAt: string;
}

export type ContentItem = Review | Post | Event;

// ── DynamoDB client (lazy — only created when TABLE env var is present) ────────

const TABLE  = process.env.DYNAMODB_TABLE ?? '';
const REGION = process.env.AWS_REGION ?? 'us-east-1';

let _ddb: DynamoDBDocumentClient | null = null;
function ddb(): DynamoDBDocumentClient {
  if (!_ddb) {
    _ddb = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: REGION }),
      { marshallOptions: { removeUndefinedValues: true } }
    );
  }
  return _ddb;
}

const now = () => new Date().toISOString();

// ── In-memory dev store ───────────────────────────────────────────────────────

const devStore: ContentItem[] = [
  {
    id: 'r1', entityType: 'REVIEW', product: 'kombucha',
    name: 'Sarah M.', email: 'sarah@example.com',
    body: 'Absolutely love it! My gut health has noticeably improved.',
    rating: 5, status: 'pending',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'r2', entityType: 'REVIEW', product: 'salve',
    name: 'Mike R.', email: 'mike@example.com',
    body: 'Healed my cracked hands in under a week. Nothing else has worked.',
    rating: 5, status: 'approved',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'r3', entityType: 'REVIEW', product: 'sobolo',
    name: 'Ama K.', email: 'ama@example.com',
    body: 'Refreshing and not too sweet. Reminds me of home.',
    rating: 4, status: 'pending',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'p1', entityType: 'POST',
    title: 'Spring Batch: New Ginger Turmeric Kombucha!',
    excerpt: 'Exciting new seasonal flavour available at this weekend\'s market.',
    body: 'Our Ginger Turmeric Kombucha combines fresh ginger with anti-inflammatory turmeric. Available now.',
    status: 'approved',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: 'e1', entityType: 'EVENT',
    title: 'Downtown Farmers Market',
    date: 'Saturday, March 15', time: '8:00 AM - 2:00 PM',
    location: 'City Center Plaza', description: 'Come find us at booth #12!',
    status: 'approved',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const isLive = () => Boolean(TABLE);

function devQuery(entityType: EntityType, status?: string): ContentItem[] {
  return devStore
    .filter(i => i.entityType === entityType && (!status || i.status === status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── DynamoDB helpers ──────────────────────────────────────────────────────────

async function dbQuery(entityType: EntityType, status?: string): Promise<ContentItem[]> {
  const result = await ddb().send(new QueryCommand({
    TableName:              TABLE,
    IndexName:              'EntityStatus-CreatedAt-Index',
    KeyConditionExpression: status
      ? 'entityType = :et AND begins_with(statusCreatedAt, :sc)'
      : 'entityType = :et',
    ExpressionAttributeValues: status
      ? { ':et': entityType, ':sc': `${status}#` }
      : { ':et': entityType },
    ScanIndexForward: false, // newest first
  }));
  return (result.Items ?? []) as ContentItem[];
}

async function dbPut(item: ContentItem): Promise<void> {
  await ddb().send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...item,
      PK:              `${item.entityType}#${item.id}`,
      SK:              'METADATA',
      statusCreatedAt: `${item.status}#${item.createdAt}`,
    },
  }));
}

async function dbUpdateStatus(entityType: EntityType, id: string, status: Status): Promise<void> {
  const ts = now();
  await ddb().send(new UpdateCommand({
    TableName:                 TABLE,
    Key:                       { PK: `${entityType}#${id}`, SK: 'METADATA' },
    UpdateExpression:          'SET #s = :s, statusCreatedAt = :sc, updatedAt = :u',
    ExpressionAttributeNames:  { '#s': 'status' },
    ExpressionAttributeValues: { ':s': status, ':sc': `${status}#${ts}`, ':u': ts },
    ConditionExpression:       'attribute_exists(PK)',
  }));
}

async function dbDelete(entityType: EntityType, id: string): Promise<void> {
  await ddb().send(new DeleteCommand({
    TableName: TABLE,
    Key:       { PK: `${entityType}#${id}`, SK: 'METADATA' },
  }));
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export async function getReviews(status?: string, product?: string): Promise<Omit<Review, 'email'>[]> {
  let items: Review[];
  if (isLive()) {
    items = (await dbQuery('REVIEW', status)) as Review[];
  } else {
    items = devQuery('REVIEW', status) as Review[];
  }
  if (product) items = items.filter(r => r.product === product);
  // Strip email — never sent to client
  return items.map(({ email: _e, ...r }) => r);
}

export async function createReview(data: {
  product: Product; name: string; email: string; body: string; rating: number;
}): Promise<string> {
  const id = randomUUID();
  const ts = now();
  const item: Review = {
    id, entityType: 'REVIEW', ...data,
    status: 'pending', createdAt: ts, updatedAt: ts,
  };
  if (isLive()) {
    await dbPut(item);
  } else {
    devStore.push(item);
  }
  return id;
}

export async function moderateReview(id: string, action: 'approve' | 'reject'): Promise<void> {
  const status: Status = action === 'approve' ? 'approved' : 'rejected';
  if (isLive()) {
    await dbUpdateStatus('REVIEW', id, status);
  } else {
    const item = devStore.find(i => i.id === id);
    if (item) { item.status = status; item.updatedAt = now(); }
  }
}

export async function deleteReview(id: string): Promise<void> {
  if (isLive()) {
    await dbDelete('REVIEW', id);
  } else {
    const idx = devStore.findIndex(i => i.id === id);
    if (idx !== -1) devStore.splice(idx, 1);
  }
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export async function getPosts(status?: string): Promise<Post[]> {
  if (isLive()) return (await dbQuery('POST', status)) as Post[];
  return devQuery('POST', status) as Post[];
}

export async function createPost(data: {
  title: string; excerpt: string; body: string;
}): Promise<Post> {
  const id = randomUUID();
  const ts = now();
  const item: Post = {
    id, entityType: 'POST', ...data,
    status: 'approved', createdAt: ts, updatedAt: ts,
  };
  if (isLive()) {
    await dbPut(item);
  } else {
    devStore.push(item);
  }
  return item;
}

export async function moderatePost(id: string, action: 'approve' | 'reject'): Promise<void> {
  const status: Status = action === 'approve' ? 'approved' : 'rejected';
  if (isLive()) {
    await dbUpdateStatus('POST', id, status);
  } else {
    const item = devStore.find(i => i.id === id);
    if (item) { item.status = status; item.updatedAt = now(); }
  }
}

export async function deletePost(id: string): Promise<void> {
  if (isLive()) {
    await dbDelete('POST', id);
  } else {
    const idx = devStore.findIndex(i => i.id === id);
    if (idx !== -1) devStore.splice(idx, 1);
  }
}

// ── Events ────────────────────────────────────────────────────────────────────

export async function getEvents(status?: string): Promise<Event[]> {
  if (isLive()) return (await dbQuery('EVENT', status)) as Event[];
  return devQuery('EVENT', status) as Event[];
}

export async function createEvent(data: {
  title: string; date: string; time: string;
  location: string; description: string;
}): Promise<Event> {
  const id = randomUUID();
  const ts = now();
  const item: Event = {
    id, entityType: 'EVENT', ...data,
    status: 'approved', createdAt: ts, updatedAt: ts,
  };
  if (isLive()) {
    await dbPut(item);
  } else {
    devStore.push(item);
  }
  return item;
}

export async function moderateEvent(id: string, action: 'approve' | 'reject'): Promise<void> {
  const status: Status = action === 'approve' ? 'approved' : 'rejected';
  if (isLive()) {
    await dbUpdateStatus('EVENT', id, status);
  } else {
    const item = devStore.find(i => i.id === id);
    if (item) { item.status = status; item.updatedAt = now(); }
  }
}

export async function deleteEvent(id: string): Promise<void> {
  if (isLive()) {
    await dbDelete('EVENT', id);
  } else {
    const idx = devStore.findIndex(i => i.id === id);
    if (idx !== -1) devStore.splice(idx, 1);
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getStats() {
  const [pr, pp, pe, ar, ap, ae, rr] = await Promise.all([
    getReviews('pending'),
    getPosts('pending'),
    getEvents('pending'),
    getReviews('approved'),
    getPosts('approved'),
    getEvents('approved'),
    getReviews('rejected'),
  ]);
  return {
    pendingReviews:  pr.length,
    pendingPosts:    pp.length,
    pendingEvents:   pe.length,
    approvedReviews: ar.length,
    approvedPosts:   ap.length,
    approvedEvents:  ae.length,
    rejectedReviews: rr.length,
    totalReviews:    pr.length + ar.length + rr.length,
    totalPosts:      pp.length + ap.length,
    totalEvents:     pe.length + ae.length,
  };
}
