import { useData } from '../commons/data';
import { createActions } from '../../../../packages/domain/src/actions';
export { blankBlock, blockData } from '../../../../packages/domain/src/actions';
export function useActions() { const { docs, save } = useData(); return createActions(docs, save); }
