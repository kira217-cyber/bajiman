import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

// Personal Auto Deposit (MFSWallet) availability — shared by the deposit
// windows (third tab) and the history window, so it is fetched once.
const useMfsStatus = (enabled = true) => {
  const { data, isLoading } = useQuery({
    queryKey: ["mfs-deposit-status"],
    queryFn: async () => {
      const res = await api.get("/api/mfs-deposit/status");
      return res.data?.data || {};
    },
    enabled,
    staleTime: 30000,
    retry: 1,
  });

  return {
    loading: isLoading,
    enabled: !!data?.enabled,
    displayName: data?.displayName || {},
    minAmount: Number(data?.minAmount || 0),
    maxAmount: Number(data?.maxAmount || 0),
    methods: Array.isArray(data?.methods) ? data.methods : [],
    bonuses: Array.isArray(data?.bonuses) ? data.bonuses : [],
  };
};

export default useMfsStatus;
