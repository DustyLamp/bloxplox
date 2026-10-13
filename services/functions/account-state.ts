import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './store';

export const deletionKey = (subject: string) => ({ pk: `DELETED#${subject}`, sk: 'ACCOUNT' });
export class AccountDeleted extends Error { constructor() { super('Account deleted'); this.name = 'AccountDeleted'; } }
export async function assertAccountActive(subject: string) {
  if ((await ddb.send(new GetCommand({ TableName: process.env.DATA_TABLE!, Key: deletionKey(subject), ConsistentRead: true }))).Item) throw new AccountDeleted();
}
