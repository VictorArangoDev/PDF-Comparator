"use client"

import { useState } from "react"
import { Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import  LoadingAnimationRive  from "@/components/ui/loader"

export default function FileUpload({ onCompare, loading }) {
  const [originalFile, setOriginalFile] = useState(null)
  const [modifiedFile, setModifiedFile] = useState(null)
  const [isDraggingOriginal, setIsDraggingOriginal] = useState(false)
  const [isDraggingModified, setIsDraggingModified] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!originalFile || !modifiedFile) {
      alert("Por favor selecciona ambos archivos PDF")
      return
    }

    await onCompare(originalFile, modifiedFile)
  }

  const handleDragOverOriginal = (e) => {
    e.preventDefault()
    setIsDraggingOriginal(true)
  }

  const handleDragLeaveOriginal = (e) => {
    e.preventDefault()
    setIsDraggingOriginal(false)
  }

  const handleDropOriginal = (e) => {
    e.preventDefault()
    setIsDraggingOriginal(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type === "application/pdf") {
      setOriginalFile(file)
    }
  }

  const handleDragOverModified = (e) => {
    e.preventDefault()
    setIsDraggingModified(true)
  }

  const handleDragLeaveModified = (e) => {
    e.preventDefault()
    setIsDraggingModified(false)
  }

  const handleDropModified = (e) => {
    e.preventDefault()
    setIsDraggingModified(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type === "application/pdf") {
      setModifiedFile(file)
    }
  }

  const formatFileSize = (bytes) => {
    return `${Math.round(bytes / 1024)} KB`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-300/80 p-4">
      <div className="relative w-full max-w-md rounded-3xl bg-white shadow-xl">
        <div className="flex items-start justify-between px-6 py-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Comparador de PDFs</h2>
            <p className="mt-1 text-sm text-gray-500">Sube dos archivos PDF para compararlos</p>
          </div>
          
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">PDF Original</label>
            {
              originalFile ? <></>
              :
            
              <div
              onDragOver={handleDragOverOriginal}
              onDragLeave={handleDragLeaveOriginal}
              onDrop={handleDropOriginal}
              className={cn(
                "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white px-6 py-10 transition-colors h-[100px]",
                isDraggingOriginal ? "border-blue-400 bg-blue-50/30" : "border-gray-300",
              )}
              >
                
              <Upload className="mb-4 size-8 text-gray-400" />
              <p className="mb-1 text-center text-[15px] font-medium text-gray-900">
                Elija un archivo o arrástrelo y suéltelo aquí.
              </p>
              <p className="mb-5 text-center text-xs text-gray-400">Formato PDF, hasta 50 MB.</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById("original-file-input").click()}
                className="border-gray-300 bg-white px-6 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                Explorar archivo
              </Button>
              <input
                id="original-file-input"
                type="file"
                accept=".pdf"
                onChange={(e) => setOriginalFile(e.target.files[0])}
                className="hidden"
                />
            </div>
            
            }   

            {originalFile && (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded bg-red-100">
                  <div className="flex size-9 items-center justify-center rounded bg-red-500">
                    <span className="text-[9px] font-bold uppercase text-white">PDF</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-gray-900">{originalFile.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{formatFileSize(originalFile.size)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setOriginalFile(null)}
                  className="shrink-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                  <X className="size-4" />
                </Button>
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">PDF Modificado</label>
            {
              modifiedFile ? <></>
              :

              <div
              onDragOver={handleDragOverModified}
              onDragLeave={handleDragLeaveModified}
              onDrop={handleDropModified}
              className={cn(
                "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white px-6 py-10 transition-colors h-[100px]",
                isDraggingModified ? "border-blue-400 bg-blue-50/30" : "border-gray-300",
              )}
              >
              <Upload className="mb-4 size-8 text-gray-400" />
              <p className="mb-1 text-center text-[15px] font-medium text-gray-900">
                Elija un archivo o arrástrelo y suéltelo aquí.
              </p>
              <p className="mb-5 text-center text-xs text-gray-400">Formato PDF, hasta 50 MB.</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById("modified-file-input").click()}
                className="border-gray-300 bg-white px-6 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                Explorar archivo
              </Button>
              <input
                id="modified-file-input"
                type="file"
                accept=".pdf"
                onChange={(e) => setModifiedFile(e.target.files[0])}
                className="hidden"
                />
            </div>
              }

            {modifiedFile && (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded bg-red-100">
                  <div className="flex size-9 items-center justify-center rounded bg-red-500">
                    <span className="text-[9px] font-bold uppercase text-white">PDF</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-gray-900">{modifiedFile.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{formatFileSize(modifiedFile.size)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setModifiedFile(null)}
                  className="shrink-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                  <X className="size-4" />
                </Button>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !originalFile || !modifiedFile}
            className="mt-6 w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 py-4 font-semibold text-white shadow-lg transition-all hover:from-blue-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:from-gray-400 disabled:to-gray-500"
            >
            {loading ? "Comparando..." : "Comparar PDFs"}
          </button>
        </form>
      </div>
        {loading ? <LoadingAnimationRive/> : <></>}     
           
    </div>
  )
}
