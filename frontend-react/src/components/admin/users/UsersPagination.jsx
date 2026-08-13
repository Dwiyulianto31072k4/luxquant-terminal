import { CollectionPagination } from "../CollectionPagination";

export const UsersPagination = ({ page, totalPages, total, onChange }) => (
  <CollectionPagination
    page={page}
    totalPages={totalPages}
    total={total}
    pageSize={20}
    onPageChange={onChange}
    itemLabel="users"
    className="m-3"
  />
);
