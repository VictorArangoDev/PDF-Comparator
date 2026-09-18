import { useRive, Layout, Alignment, Fit } from "@rive-app/react-canvas";
import { useState } from "react";


export default function LoadingAnimationRive() {
   
    const { RiveComponent } = useRive({
        src: "./src/assets/processing.riv",
        autoplay: true,
        layout: new Layout({
            fit: Fit.Contain,
            alignment: Alignment.Center,
        }),
    });


    return (
        <div className="absolute flex items-center justify-center h-full w-full rounded-sm z-10 bg-black/0 backdrop-blur-sm">
            <div className="h-48 w-48" >
            <RiveComponent />
            </div>
        </div>
    );

}