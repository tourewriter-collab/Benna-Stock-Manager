// vite.config.ts
import { defineConfig, loadEnv } from "file:///C:/Users/Mosaid/Downloads/My%20Code/benna%20stock%20manager/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/Mosaid/Downloads/My%20Code/benna%20stock%20manager/node_modules/@vitejs/plugin-react/dist/index.js";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    // Use relative paths for assets in all modes (Electron file:// compatible)
    base: "./",
    server: {
      port: 8080
    },
    build: {
      outDir: "dist",
      rollupOptions: {
        external: ["better-sqlite3"]
        // Prevents Vite from trying to "bundle" the database
      }
    },
    define: {
      "process.env.VITE_SUPABASE_URL": JSON.stringify(env.VITE_SUPABASE_URL),
      "process.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(env.VITE_SUPABASE_ANON_KEY)
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxNb3NhaWRcXFxcRG93bmxvYWRzXFxcXE15IENvZGVcXFxcYmVubmEgc3RvY2sgbWFuYWdlclwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcTW9zYWlkXFxcXERvd25sb2Fkc1xcXFxNeSBDb2RlXFxcXGJlbm5hIHN0b2NrIG1hbmFnZXJcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL01vc2FpZC9Eb3dubG9hZHMvTXklMjBDb2RlL2Jlbm5hJTIwc3RvY2slMjBtYW5hZ2VyL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgbW9kZSB9KSA9PiB7XG4gIGNvbnN0IGVudiA9IGxvYWRFbnYobW9kZSwgcHJvY2Vzcy5jd2QoKSwgJycpO1xuXG4gIHJldHVybiB7XG4gICAgcGx1Z2luczogW3JlYWN0KCldLFxuICAgIC8vIFVzZSByZWxhdGl2ZSBwYXRocyBmb3IgYXNzZXRzIGluIGFsbCBtb2RlcyAoRWxlY3Ryb24gZmlsZTovLyBjb21wYXRpYmxlKVxuICAgIGJhc2U6ICcuLycsXG4gICAgc2VydmVyOiB7XG4gICAgICBwb3J0OiA4MDgwLFxuICAgIH0sXG4gICAgYnVpbGQ6IHtcbiAgICAgIG91dERpcjogJ2Rpc3QnLFxuICAgICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgICBleHRlcm5hbDogWydiZXR0ZXItc3FsaXRlMyddLCAvLyBQcmV2ZW50cyBWaXRlIGZyb20gdHJ5aW5nIHRvIFwiYnVuZGxlXCIgdGhlIGRhdGFiYXNlXG4gICAgICB9LFxuICAgIH0sXG4gICAgZGVmaW5lOiB7XG4gICAgICAncHJvY2Vzcy5lbnYuVklURV9TVVBBQkFTRV9VUkwnOiBKU09OLnN0cmluZ2lmeShlbnYuVklURV9TVVBBQkFTRV9VUkwpLFxuICAgICAgJ3Byb2Nlc3MuZW52LlZJVEVfU1VQQUJBU0VfQU5PTl9LRVknOiBKU09OLnN0cmluZ2lmeShlbnYuVklURV9TVVBBQkFTRV9BTk9OX0tFWSksXG4gICAgfSxcbiAgfTtcbn0pOyJdLAogICJtYXBwaW5ncyI6ICI7QUFBbVcsU0FBUyxjQUFjLGVBQWU7QUFDelksT0FBTyxXQUFXO0FBRWxCLElBQU8sc0JBQVEsYUFBYSxDQUFDLEVBQUUsS0FBSyxNQUFNO0FBQ3hDLFFBQU0sTUFBTSxRQUFRLE1BQU0sUUFBUSxJQUFJLEdBQUcsRUFBRTtBQUUzQyxTQUFPO0FBQUEsSUFDTCxTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUE7QUFBQSxJQUVqQixNQUFNO0FBQUEsSUFDTixRQUFRO0FBQUEsTUFDTixNQUFNO0FBQUEsSUFDUjtBQUFBLElBQ0EsT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLE1BQ1IsZUFBZTtBQUFBLFFBQ2IsVUFBVSxDQUFDLGdCQUFnQjtBQUFBO0FBQUEsTUFDN0I7QUFBQSxJQUNGO0FBQUEsSUFDQSxRQUFRO0FBQUEsTUFDTixpQ0FBaUMsS0FBSyxVQUFVLElBQUksaUJBQWlCO0FBQUEsTUFDckUsc0NBQXNDLEtBQUssVUFBVSxJQUFJLHNCQUFzQjtBQUFBLElBQ2pGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
