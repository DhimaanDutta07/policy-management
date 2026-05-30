import React from "react";
import PolicyList from "../components/policy/PolicyList";
import axios from "axios";

export const PolicyPage: React.FC = () => {
  // Delete handler
  const handleDeletePolicy = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this policy?")) return;
    try {
      const token = localStorage.getItem("authToken");
      await axios.delete(
        `${import.meta.env.VITE_BASE_URL}/api/v1/policies/${id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // PolicyList will handle refreshing its own data
    } catch (err) {
      console.error("Error deleting policy:", err);
    }
  };

  // Show list
  return (
    <div className="p-2">
      <PolicyList
        onDeletePolicy={handleDeletePolicy}
      />
    </div>
  );
};