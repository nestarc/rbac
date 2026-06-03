import { InMemoryRbacStorage } from '../../src';
import { runRbacStorageContract } from './storage-contract';

runRbacStorageContract({ createStorage: () => new InMemoryRbacStorage() });
