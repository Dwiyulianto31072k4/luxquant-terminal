import { CollectionPagination } from "../../CollectionPagination";

export const FinancePagination = ({ page, totalPages, total, onChange }) => (
  <CollectionPagination
    page={page}
    totalPages={totalPages}
    total={total}
    pageSize={25}
    onPageChange={onChange}
    itemLabel="payments"
  />
);
