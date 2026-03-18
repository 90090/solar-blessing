/**
 * AWS Lambda Handler — Solar Blessing REST API
 * ─────────────────────────────────────────────────────────────────────────────
 * This is the template for your AWS Lambda function sitting behind API Gateway.
 *
 * Recommended AWS Architecture:
 *   API Gateway (REST API) → Lambda → DynamoDB
 *
 * DynamoDB Table Design (single-table):
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Table: SolarBlessingContent                                             │
 * │                                                                          │
 * │  PK (partition key): entity type + ID                                   │
 * │    e.g.  "REVIEW#r-uuid-here"                                           │
 * │          "POST#p-uuid-here"                                             │
 * │          "EVENT#e-uuid-here"                                            │
 * │                                                                          │
 * │  SK (sort key): status or "METADATA"                                    │
 * │    e.g.  "STATUS#pending"                                               │
 * │          "STATUS#approved"                                              │
 * │                                                                          │
 * │  GSI-1: status-createdAt-index                                         │
 * │    PK: entityType (REVIEW / POST / EVENT)                               │
 * │    SK: status#createdAt (for filtering by status + sorting by date)     │
 * │                                                                          │
 * │  Attributes per item:                                                   │
 * │    id, entityType, status, createdAt, updatedAt                         │
 * │    + entity-specific fields (see interfaces below)                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * IAM: Lambda execution role needs dynamodb:GetItem, PutItem, UpdateItem,
 *       DeleteItem, Query on this table only (least privilege).
 *
 * Install: npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb uuid
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

// ── DynamoDB client ───────────────────────────────────────────────────────────
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
);
const TABLE = process.env.DYNAMODB_TABLE ?? 'SolarBlessingContent';

// ── Types ─────────────────────────────────────────────────────────────────────
type Status = 'pending' | 'approved' | 'rejected';

interface Review {
  id: string; entityType: 'REVIEW';
  product: 'kombucha' | 'sobolo' | 'salve';
  name: string; email: string; body: string; rating: number;
  status: Status; createdAt: string; updatedAt: string;
}

interface Post {
  id: string; entityType: 'POST';
  title: string; excerpt: string; body: string;
  status: Status; createdAt: string; updatedAt: string;
}

interface Event {
  id: string; entityType: 'EVENT';
  title: string; date: string; time: string; location: string; description: string;
  status: Status; createdAt: string; updatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const now = () => new Date().toISOString();
const resp = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN ?? 'https://solarblessing.com',
    'Access-Control-Allow-Credentials': 'true',
  },
  body: JSON.stringify(body),
});

// ── Query by entity type + status ─────────────────────────────────────────────
async function queryItems(entityType: string, status?: string) {
  const cmd = new QueryCommand({
    TableName:              TABLE,
    IndexName:              'status-createdAt-index',
    KeyConditionExpression: status
      ? 'entityType = :et AND begins_with(statusCreatedAt, :sc)'
      : 'entityType = :et',
    ExpressionAttributeValues: status
      ? { ':et': entityType, ':sc': `${status}#` }
      : { ':et': entityType },
    ScanIndexForward: false, // newest first
  });
  const result = await ddb.send(cmd);
  return result.Items ?? [];
}

// ── CRUD helpers ──────────────────────────────────────────────────────────────
async function putItem(item: Review | Post | Event) {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...item,
      PK: `${item.entityType}#${item.id}`,
      SK: 'METADATA',
      statusCreatedAt: `${item.status}#${item.createdAt}`,
    },
  }));
}

async function updateStatus(entityType: string, id: string, status: Status) {
  await ddb.send(new UpdateCommand({
    TableName:                 TABLE,
    Key:                       { PK: `${entityType}#${id}`, SK: 'METADATA' },
    UpdateExpression:          'SET #s = :s, statusCreatedAt = :sc, updatedAt = :u',
    ExpressionAttributeNames:  { '#s': 'status' },
    ExpressionAttributeValues: {
      ':s':  status,
      ':sc': `${status}#${now()}`,
      ':u':  now(),
    },
  }));
}

async function deleteItem(entityType: string, id: string) {
  await ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key:       { PK: `${entityType}#${id}`, SK: 'METADATA' },
  }));
}

// ── Lambda handler ────────────────────────────────────────────────────────────
export async function handler(event: AWSLambdaEvent) {
  const { httpMethod, path, queryStringParameters, body: rawBody } = event;
  const body = rawBody ? JSON.parse(rawBody) : {};
  const segments = path.replace(/^\//, '').split('/'); // e.g. ['reviews'] or ['admin','reviews','id']

  try {
    // ── Public: GET /reviews?product=kombucha ────────────────────────────────
    if (httpMethod === 'GET' && segments[0] === 'reviews' && segments.length === 1) {
      const items = await queryItems('REVIEW', 'approved');
      const product = queryStringParameters?.product;
      const filtered = product ? items.filter((r: any) => r.product === product) : items;
      // Strip email before returning to client
      return resp(200, filtered.map(({ email: _e, ...r }: any) => r));
    }

    // ── Public: POST /reviews ─────────────────────────────────────────────────
    if (httpMethod === 'POST' && segments[0] === 'reviews' && segments.length === 1) {
      const review: Review = {
        id: randomUUID(), entityType: 'REVIEW',
        product:   body.product,
        name:      body.name,
        email:     body.email, // stored, never returned
        body:      body.body,
        rating:    body.rating,
        status:    'pending',
        createdAt: now(), updatedAt: now(),
      };
      await putItem(review);
      return resp(201, { id: review.id, message: 'Review submitted for approval.' });
    }

    // ── Admin: GET /admin/stats ───────────────────────────────────────────────
    if (httpMethod === 'GET' && path === '/admin/stats') {
      const [pr, pp, pe, ar, ap, ae] = await Promise.all([
        queryItems('REVIEW', 'pending'),
        queryItems('POST',   'pending'),
        queryItems('EVENT',  'pending'),
        queryItems('REVIEW', 'approved'),
        queryItems('POST',   'approved'),
        queryItems('EVENT',  'approved'),
      ]);
      return resp(200, {
        pendingReviews:  pr.length,
        pendingPosts:    pp.length,
        pendingEvents:   pe.length,
        approvedReviews: ar.length,
        approvedPosts:   ap.length,
        approvedEvents:  ae.length,
      });
    }

    // ── Admin: GET /admin/reviews ─────────────────────────────────────────────
    if (httpMethod === 'GET' && segments[0] === 'admin' && segments[1] === 'reviews' && segments.length === 2) {
      const status = queryStringParameters?.status;
      const items = await queryItems('REVIEW', status);
      return resp(200, items.map(({ email: _e, ...r }: any) => r));
    }

    // ── Admin: PATCH /admin/reviews/:id ───────────────────────────────────────
    if (httpMethod === 'PATCH' && segments[0] === 'admin' && segments[1] === 'reviews' && segments[2]) {
      if (!['approve','reject'].includes(body.action)) return resp(422, { message: 'Invalid action' });
      await updateStatus('REVIEW', segments[2], body.action === 'approve' ? 'approved' : 'rejected');
      return resp(204, null);
    }

    // ── Admin: DELETE /admin/reviews/:id ──────────────────────────────────────
    if (httpMethod === 'DELETE' && segments[0] === 'admin' && segments[1] === 'reviews' && segments[2]) {
      await deleteItem('REVIEW', segments[2]);
      return resp(204, null);
    }

    // ── Admin: GET /admin/posts ───────────────────────────────────────────────
    if (httpMethod === 'GET' && segments[0] === 'admin' && segments[1] === 'posts' && segments.length === 2) {
      const status = queryStringParameters?.status;
      return resp(200, await queryItems('POST', status));
    }

    // ── Admin: POST /admin/posts ──────────────────────────────────────────────
    if (httpMethod === 'POST' && segments[0] === 'admin' && segments[1] === 'posts' && segments.length === 2) {
      const post: Post = {
        id: randomUUID(), entityType: 'POST',
        title: body.title, excerpt: body.excerpt ?? '', body: body.body,
        status: 'approved', createdAt: now(), updatedAt: now(),
      };
      await putItem(post);
      return resp(201, post);
    }

    // ── Admin: PATCH/DELETE /admin/posts/:id ──────────────────────────────────
    if (segments[0] === 'admin' && segments[1] === 'posts' && segments[2]) {
      if (httpMethod === 'PATCH') {
        await updateStatus('POST', segments[2], body.action === 'approve' ? 'approved' : 'rejected');
        return resp(204, null);
      }
      if (httpMethod === 'DELETE') {
        await deleteItem('POST', segments[2]);
        return resp(204, null);
      }
    }

    // ── Admin: GET /admin/events ──────────────────────────────────────────────
    if (httpMethod === 'GET' && segments[0] === 'admin' && segments[1] === 'events' && segments.length === 2) {
      const status = queryStringParameters?.status;
      return resp(200, await queryItems('EVENT', status));
    }

    // ── Admin: POST /admin/events ─────────────────────────────────────────────
    if (httpMethod === 'POST' && segments[0] === 'admin' && segments[1] === 'events' && segments.length === 2) {
      const ev: Event = {
        id: randomUUID(), entityType: 'EVENT',
        title: body.title, date: body.date, time: body.time ?? '',
        location: body.location, description: body.description ?? '',
        status: 'approved', createdAt: now(), updatedAt: now(),
      };
      await putItem(ev);
      return resp(201, ev);
    }

    // ── Admin: PATCH/DELETE /admin/events/:id ─────────────────────────────────
    if (segments[0] === 'admin' && segments[1] === 'events' && segments[2]) {
      if (httpMethod === 'PATCH') {
        await updateStatus('EVENT', segments[2], body.action === 'approve' ? 'approved' : 'rejected');
        return resp(204, null);
      }
      if (httpMethod === 'DELETE') {
        await deleteItem('EVENT', segments[2]);
        return resp(204, null);
      }
    }

    return resp(404, { message: 'Not found' });
  } catch (err) {
    console.error('Lambda error:', err);
    return resp(500, { message: 'Internal server error' });
  }
}

// ── Minimal Lambda event type ─────────────────────────────────────────────────
interface AWSLambdaEvent {
  httpMethod: string;
  path: string;
  queryStringParameters?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
}
